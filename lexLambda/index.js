/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

const AWS = require("aws-sdk");
const { LexRuntimeServiceClient, DeleteSessionCommand } = require("@aws-sdk/client-lex-runtime-service");
const REGION = process.env.REGION;
const wavFileBucket = process.env["WAVFILE_BUCKET"];

const s3 = new AWS.S3();
const lexClient = new AWS.LexRuntime({ signatureVersion: 'v4', region: REGION });
const polly = new AWS.Polly({ signatureVersion: "v4", region: REGION, });
const { ChimeClient, UpdateSipMediaApplicationCallCommand } = require("@aws-sdk/client-chime");

// change these to match your Lex bot
const lexBotName = 'OrderFlowers';
const lexBotAlias = 'PROD';

// change these to tune how the SMA detects silence when recording
const messageMaximumLengthInSeconds = 15;
const silenceDurationInSeconds = 2.0;
const silenceThreshold = 200;

// S3 bucket details
const announcementsKeyPrefix = "announcements/";
const recordingsKeyPrefix = "recordings/";
const s3AnnounceBucketName = wavFileBucket;

// This is the Lex input type for telephone calls.
const lexInputContentType = 'audio/lpcm; sample-rate=8000; sample-size-bits=16; channel-count=1; is-big-endian=false';
// To provide a level of flexibility, I'm actually just taking SSML responses from Lex and reencoding with Polly.
// You could also choose to take PCM responses and render them back directly. It really is up to you. I have examples
// in other parts of the solve about constructing wave files for playback (indeed, the code is also available in this function).
const lexOutputContentType = 'text/plain; charset=utf-8';


exports.handler = async (event, context, callback) => {
  console.log(JSON.stringify(event));
  console.log(JSON.stringify(context));
  let actions = [];

  switch (event.InvocationEventType) {
    case "ACTION_SUCCESSFUL":
      console.log("ACTION_SUCCESSFUL");
      actions = await actionSuccessful(event);
      console.log("ACTION_SUCCESSFUL actions: ", actions);
      break;

    default:
      console.log("Unexpected message!");
      break;
  }

  const response = {
    SchemaVersion: "1.0",
    Actions: actions,
  };
  callback(null, response);
};

async function actionSuccessful(event) {
  console.log("actionSuccessful: ", JSON.stringify(event));
  let rv = [];

  const legA = getLegACallDetails(event);

  if (legA && event.ActionData && event.ActionData.Type === 'RecordAudio' && event.ActionData.RecordingDestination && event.ActionData.RecordingDestination.Key) {
    let rv = [];
    const callID = legA.CallId;
    console.log("we got a recording, callID: ", callID);
    console.log("event.ActionData.RecordingDestination.Key: ", event.ActionData.RecordingDestination.Key);

    const outboundWaveDataToLex = event.ActionData.RecordingDestination.Key;
    const bucketName = event.ActionData.RecordingDestination.BucketName;
    console.log("bucketName: ", bucketName, "   -  outboundWaveDataToLex: ", outboundWaveDataToLex);

    var lexInputStream;
    try {
      lexInputStream = await getS3Data(bucketName, outboundWaveDataToLex);
      console.log("lexInputStream: ", lexInputStream);
    } catch (error) {
      console.log(error);
      rv = [hangupAction];
      return rv;
    }

    const lexParams = {
      userId: callID,
      botName: lexBotName,
      botAlias: lexBotAlias,
      contentType: lexInputContentType,
      requestAttributes: {
        'x-amz-lex:accept-content-types': 'PlainText,SSML'
      },
      accept: lexOutputContentType,
      inputStream: lexInputStream,
    };
    console.log("lexParams: ", lexParams);
    var lexResponse;
    try {
      lexResponse = await lexClient.postContent(lexParams).promise();
      console.log("lexResponse: ", lexResponse);
    } catch (error) {
      console.log("error from lex: ", error);
      rv = [hangupAction];
      return rv;
    }
    var lexResponseKey;
    if (lexResponse.dialogState !== 'ReadyForFulfillment') {
      lexResponseKey = announcementsKeyPrefix + callID + '/' + 'seq-' + event.Sequence + '-lexresponse.wav';
      console.log("lexResponseKey: ", lexResponseKey);

      var pollyResponse;
      try {
        pollyResponse = await synthesizeSpeech(s3AnnounceBucketName, lexResponseKey, lexResponse.message, lexResponse.messageType === 'SSML' ? 'ssml' : 'text', 'Joanna', 'en-US');
        console.log("pollyResponse: ", JSON.stringify(pollyResponse));
      } catch (error) {
        console.log("error from Polly: ", error);
        rv = [hangupAction];
        return rv;
      }
      var result;
      try {
        result = await sendUpdateSipMediaApplicationCallCommand(event.CallDetails.SipMediaApplicationId, event.CallDetails.TransactionId, lexResponseKey, false);
        rv = [];
        return rv;
      }
      catch (error) {
        console.log("error sending sendUpdateSipMediaApplicationCallCommand");
        rv = [hangupAction];
        return rv;
      }
    } else {
      const endKey = announcementsKeyPrefix + callID + '/' + 'seq-' + event.Sequence + "-end.wav";
      endPhrase = "<speak><break time=\"1s\"/>Thank you for placing your order with the Flower Store!  Goodbye!</speak>";
      console.log("ReadyForFullfillment: ", endKey);
      var result;
      try {
        result = await synthesizeWelcomeSpeech(endPhrase, endKey);
      }
      catch (error) {
        console.log("error synthing fullfillment message", JSON.stringify(error));
      }
      console.log("finished synth on fullfillment:", JSON.stringify(result));
      try {
        result = await sendUpdateSipMediaApplicationCallCommand(event.CallDetails.SipMediaApplicationId, event.CallDetails.TransactionId, endKey, true);
        rv = [];
        return rv;
      }
      catch (error) {
        console.log("error sending sendUpdateSipMediaApplicationCallCommand");
        rv = [hangupAction];
        return rv;
      }
    }
  };

  async function sendUpdateSipMediaApplicationCallCommand(SipMediaApplicationId, TransactionId, keyFile, endFlag) {
    console.log("sendUpdateSipMediaApplicationCallCommand: ", SipMediaApplicationId, TransactionId, keyFile, endFlag);
    const chimeClient = new ChimeClient({ region: "REGION" });
    let params = {
      SipMediaApplicationId: SipMediaApplicationId,
      TransactionId: TransactionId,
      Arguments: {
        nextPlayFile: keyFile,
        bucketName: s3AnnounceBucketName,
        endCall: JSON.stringify(endFlag),
      }
    }
    console.log("params: ", JSON.stringify(params));
    const command = new UpdateSipMediaApplicationCallCommand(params);
    console.log("command: ", JSON.stringify(command));
    try {
      const response = await chimeClient.send(command);
      console.log("response: ", JSON.stringify(response));
      return true;
    } catch (error) {
      console.log("Error updating SMA: ", error);
      return false;
    }
  }
}


const recordAudioAction = {
  Type: "RecordAudio",
  Parameters: {
    DurationInSeconds: "10",
    SilenceDurationInSeconds: silenceDurationInSeconds,
    SilenceThreshold: silenceThreshold,
    RecordingTerminators: [
      "#"
    ],
    RecordingDestination: {
      Type: "S3",
      BucketName: wavFileBucket,
      Prefix: recordingsKeyPrefix,
    }
  }
}

const hangupAction = {
  Type: "Hangup",
  Parameters: {
    SipResponseCode: "0",
    ParticipantTag: "",
  },
};

const playAudioAction = {
  Type: "PlayAudio",
  Parameters: {
    AudioSource: {
      Type: "S3",
      BucketName: wavFileBucket,
      Key: "",
    },
  },
};

const pauseAction = {
  Type: "Pause",
  Parameters: {
    DurationInMilliseconds: "1000",
  },
};

/* ************************************************************************************

The following functions are support funtions and can be used as-is.

*************************************************************************************** */

function getLegACallDetails(event) {
  let rv = null;
  if (event && event.CallDetails && event.CallDetails.Participants && event.CallDetails.Participants.length > 0) {
    for (let i = 0; i < event.CallDetails.Participants.length; i++) {
      if (event.CallDetails.Participants[i].ParticipantTag === 'LEG-A') {
        rv = event.CallDetails.Participants[i];
        break;
      }
    }
  }
  return rv;
}

function pad(num, size) {
  num = num.toString();
  while (num.length < size) num = "0" + num;
  return num;
}

async function synthesizeSpeech(s3Bucket, s3Key, text, textType, voiceID, languageCode) {
  let audioBuffer = '';
  let audioBuffer2 = '';
  try {
    audioBuffer = await synthesizeSpeechInternal(text, textType, voiceID, languageCode);
  } catch (error) {
    console.log(error);
    return null;
  }
  if (audioBuffer) {
    try {
      audioBuffer2 = await addWaveHeaderAndUploadToS3(audioBuffer, s3Bucket, s3Key);
    } catch (error) {
      console.log(error);
      return null;
    }
    return audioBuffer2;
  }
  return null;
};

async function synthesizeWelcomeSpeech(phrase, s3Key) {
  console.log("phrase: ", phrase, " s3Key: ", s3Key);

  let audioBuffer = '';
  let audioBuffer2 = '';

  try {
    audioBuffer = await synthesizeSpeechInternal(phrase, 'ssml', 'Joanna', 'en-US');
  } catch (error) {
    console.log(error);
    return null;
  }
  if (audioBuffer) {
    try {
      audioBuffer2 = await addWaveHeaderAndUploadToS3(audioBuffer, wavFileBucket, s3Key);
    } catch (error) {
      console.log(error);
      return null;
    }
  } else { return null; }

  if (audioBuffer2) {
    return audioBuffer2;
  }
  return null;
};

async function putCaller(phoneNumber, id, startTime) {
  var params = {
    TableName: callInfoTable,
    Item: {
      phoneNumber: phoneNumber,
      id: id,
      startTime: startTime,
    },
  };

  try {
    const results = await documentClient.put(params).promise();
    console.log(results);
    return results;
  } catch (err) {
    console.log(err);
    return err;
  }
}

async function getCaller(phonenumber) {
  console.log("getCaller: " + phonenumber);
  var params = {
    TableName: callInfoTable,
    Key: { phoneNumber: phonenumber },
  };

  console.log(params);
  try {
    const results = await documentClient.get(params).promise();
    console.log("database results: ", results);
    if (results.phoneNumber == phonenumber) {
      console.log(results);
      return true;
    } else {
      console.log("Phone number not found");
      return false;
    }
  } catch (err) {
    console.log(err);
    console.log("Error looking for phone number");
    return false;
  }
}

async function getS3Data(s3Bucket, s3Key) {
  let s3params = {
    Bucket: s3Bucket,
    Key: s3Key
  };

  let s3Object;
  try {
    s3Object = await s3.getObject(s3params).promise();
  } catch (error) {
    console.log(error);
    return null;
  }
  return s3Object.Body;
}

async function synthesizeSpeechInternal(text, textType, voiceID, languageCode) {
  let pollyparams = {
    'Text': text,
    'TextType': textType,
    'OutputFormat': 'pcm',
    'SampleRate': '8000',
    'VoiceId': voiceID,
    'LanguageCode': languageCode
  };

  var pollyResult;
  try {
    pollyResult = await polly.synthesizeSpeech(pollyparams).promise();
  } catch (error) {
    console.log(error);
    return null;
  }
  if (pollyResult.AudioStream.buffer) {
    return pollyResult.AudioStream.buffer;
  }
  else {
    return null;
  }
}

async function addWaveHeaderAndUploadToS3(audioBuffer, s3Bucket, s3Key) {
  var uint16Buffer = new Uint16Array(audioBuffer);

  var wavArray = buildWaveHeader({
    numFrames: uint16Buffer.length,
    numChannels: 1,
    sampleRate: 8000,
    bytesPerSample: 2
  });

  var totalBuffer = _appendBuffer(wavArray, audioBuffer);
  return await uploadAnnouncementToS3(s3Bucket, s3Key, totalBuffer);
};

async function uploadAnnouncementToS3(s3Bucket, s3Key, totalBuffer) {
  var buff = Buffer.from(totalBuffer);

  let s3params = {
    Body: buff,
    Bucket: s3Bucket,
    Key: s3Key,
    ContentType: 'audio/wav'
  };

  return s3.upload(s3params).promise();
};


function buildWaveHeader(opts) {
  var numFrames = opts.numFrames;
  var numChannels = opts.numChannels || 2;
  var sampleRate = opts.sampleRate || 44100;
  var bytesPerSample = opts.bytesPerSample || 2;
  var blockAlign = numChannels * bytesPerSample;
  var byteRate = sampleRate * blockAlign;
  var dataSize = numFrames * blockAlign;

  var buffer = new ArrayBuffer(44);
  var dv = new DataView(buffer);

  var p = 0;

  function writeString(s) {
    for (var i = 0; i < s.length; i++) {
      dv.setUint8(p + i, s.charCodeAt(i));
    }
    p += s.length;
  }

  function writeUint32(d) {
    dv.setUint32(p, d, true);
    p += 4;
  }

  function writeUint16(d) {
    dv.setUint16(p, d, true);
    p += 2;
  }

  writeString('RIFF');              // ChunkID
  writeUint32(dataSize + 36);       // ChunkSize
  writeString('WAVE');              // Format
  writeString('fmt ');              // Subchunk1ID
  writeUint32(16);                  // Subchunk1Size
  writeUint16(1);                   // AudioFormat
  writeUint16(numChannels);         // NumChannels
  writeUint32(sampleRate);          // SampleRate
  writeUint32(byteRate);            // ByteRate
  writeUint16(blockAlign);          // BlockAlign
  writeUint16(bytesPerSample * 8);  // BitsPerSample
  writeString('data');              // Subchunk2ID
  writeUint32(dataSize);            // Subchunk2Size

  return buffer;
}

var _appendBuffer = function (buffer1, buffer2) {
  var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  tmp.set(new Uint8Array(buffer1), 0);
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
  return tmp;
};


