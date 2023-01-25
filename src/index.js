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
const { Nimble } = require("aws-sdk");
const { runInContext } = require("vm");

// These are general variables set by the CDK, or by convention
const REGION = process.env.REGION;
const wavFileBucket = process.env["WAVFILE_BUCKET"];
const callInfoTable = process.env["CALLINFO_TABLE_NAME"];
const lexLambdaArn = process.env["LEX_LAMBDA"];
const announcementsKeyPrefix = "announcements/";
const recordingsKeyPrefix = "recordings/";
const s3AnnounceBucketName = wavFileBucket;

// Create the resources needed
const s3 = new AWS.S3();
const polly = new AWS.Polly({ signatureVersion: "v4", region: REGION, });
const tc = new AWS.TranscribeService({ signatureVersion: "v4", region: REGION, });
const lexClient = new AWS.LexRuntime({ signatureVersion: 'v4', region: REGION });
var documentClient = new AWS.DynamoDB.DocumentClient();

// defines the audio masking file - in this case, specified in the CDK
const audioMaskFileKey = process.env["AUDIO_MASK_FILE"];

// these control the recording of the users voice commands
const messageMaximumLengthInSeconds = 15;
// this is how long of silence is needed to end recording
const silenceDurationInSeconds = 2.0;
// this controls the 'background threshold' for detecting silence
const silenceThreshold = 200;

// This is the Lex input type for telephone calls.
const lexInputContentType = 'audio/lpcm; sample-rate=8000; sample-size-bits=16; channel-count=1; is-big-endian=false';
// To provide a level of flexibility, I'm actually just taking SSML responses from Lex and reencoding with Polly.
// You could also choose to take PCM responses and render them back directly. It really is up to you. I have examples
// in other parts of the solve about constructing wave files for playback (indeed, the code is also available in this function).
const lexOutputContentType = 'text/plain; charset=utf-8';

exports.handler = async (event, context, callback) => {
  console.log(JSON.stringify(event));
  console.log("wavFileBucket: ", wavFileBucket);
  let actions;

  switch (event.InvocationEventType) {
    case "NEW_INBOUND_CALL":
      console.log("NEW_INBOUND_CALL");
      try {
        actions = await newCall(event);
      }
      catch (error) {
        console.log(error);
        actions = [hangupAction];
      }
      break;

    case "CALL_UPDATE_REQUESTED":
      console.log("CALL_UPDATE_REQUESTED");
      try {
        actions = await updateRequested(event);
      }
      catch (error) {
        console.log(error);
        actions = [hangupAction];
      }
      break;

    case "ACTION_SUCCESSFUL":
      console.log("ACTION_SUCCESSFUL");
      try {
        actions = await actionSuccessful(event);
      }
      catch (error) {
        console.log(error);
        actions = [hangupAction];
      }
      break;

    case "ACTION_INTERRUPTED":
      console.log("ACTION_INTERRUPTED");
      actions = []; // don't hang up!
      break;

    case "HANGUP":
      actions = [];
      break;

    case "CALL_ANSWERED":
      actions = [];
      break;

    default:
      actions = [hangupAction];
  }

  const response = {
    SchemaVersion: "1.0",
    Actions: actions,
  };
  console.log("sending actions to SMA: ", JSON.stringify(actions));
  callback(null, response);
};

async function newCall(event) {
  console.log("newCall: ", JSON.stringify(event));
  let rv = [];
  const legA = getLegACallDetails(event);
  if (legA) {
    // set the params for the welcome
    const callID = legA.CallId;
    const s3EntranceKeyName = announcementsKeyPrefix + callID + "/hello.wav";
    const welcomePhrase = "<speak><break time=\"1s\"/>Hello, and welcome to the Flower Store!  How can I help you?</speak>";
    console.log(s3EntranceKeyName);
    console.log(welcomePhrase);
    try {
      const results = await synthesizeWelcomeSpeech(welcomePhrase, s3EntranceKeyName);
      console.log("results: ", JSON.stringify(results));
    } catch (error) {
      console.log(error);
      rv = [hangupAction];
      return rv;
    }
    playAudioAction.Parameters.AudioSource.Key = s3EntranceKeyName;
    try {
      rv = await playResponseAndRecordForLex(event, s3EntranceKeyName, rv);
    } catch (error) {
      console.log(error);
    }
  } else rv = [hangupAction];

  return rv;
}

async function actionSuccessful(event) {
  console.log("actionSuccessful: ", JSON.stringify(event));

  let rv = [];
  playAudioAction.Parameters.AudioSource.Key = audioMaskFileKey;
  rv.push(playAudioAction);

  // ask the LexLambda to process the recording
  var lambda = new AWS.Lambda();
  var params = {
    FunctionName: lexLambdaArn,
    InvocationType: 'Event',
    LogType: 'Tail',
    Payload: JSON.stringify(event),
  };
  lambda.invoke(params, function (err, data) {
    if (err) {
      console.log("err: ", JSON.stringify(err));
      rv = [hangupAction];
    } else {
      console.log('ChimeSdkLexLambda said ' + data.Payload);
    }
  })
  return rv;
}

async function updateRequested(event) {
  console.log("updateRequested:: ", JSON.stringify(event));

  let rv = [];
  let audioFile = '';
  const legA = getLegACallDetails(event);

  if (legA) {
    const callID = legA.CallId;
    if (event.ActionData.Parameters.Arguments.nextPlayFile) {
      audioFile = event.ActionData.Parameters.Arguments.nextPlayFile;
    } else {
      console.log("did not get expected data for playFile");
      rv.push(hangupAction);
      return rv;
    }
    console.log("playing: ", audioFile);
    playAudioAction.Parameters.AudioSource.Key = audioFile;
    endFlag = event.ActionData.Parameters.Arguments.endCall;

    if (endFlag == "true") {
      rv = [playAudioAction, hangupAction];
    } else {
      try {
        rv = await playResponseAndRecordForLex(event, audioFile, rv);
      } catch (error) {
        console.log(error);
        return rv;
      }
    }
  } else {
    rv = [hangupAction];
  }
  console.log("actions being sent to SMA: ", JSON.stringify(rv));
  return rv;
}

const recordAudioAction = {
  Type: "RecordAudio",
  Parameters: {
    DurationInSeconds: messageMaximumLengthInSeconds,
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
    Repeat: "1",
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

// Construct a playback and record action sequence for the Lex bot.
async function playResponseAndRecordForLex(event, lexResponseKey, currentActions) {
  console.log("playResponseAndRecordForLex currenActions: ", JSON.stringify(currentActions));

  let rv = [];
  if (currentActions && currentActions.length > 0) { rv = currentActions; }

  const legA = getLegACallDetails(event);
  if (legA) {
    const callID = legA.CallId;
    if (lexResponseKey) {
      playAudioAction.Parameters.AudioSource.Key = lexResponseKey;
      rv.push(playAudioAction);
    }

    recordAudioAction.Parameters.RecordingDestination.Prefix = recordingsKeyPrefix;
    rv.push(recordAudioAction);
  } else rv = [hangupAction];
  return rv;
};

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


function pad(num, size) {
  num = num.toString();
  while (num.length < size) num = "0" + num;
  return num;
}

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


