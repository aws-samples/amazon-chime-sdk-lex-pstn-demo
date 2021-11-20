# Simplified API Call Flow

This solution uses a single Phone Number, SIP Media Appliance (SMA) and SIP Rule as well as two lambda functions.  It also uses Amazon Polly to generate voice
prompts and Amazon Lex to interpret caller requests.  Recordings of caller requests and system audio responses are stored on an Amazon S3 bucket in the account.

The basic sequence of API operations is shown below:

![](images/callflow.drawio.svg?raw=true)

When a caller dials the application phone number the SMA will send a NEW_INBOUND_CALL message to the application lambda function.  That function will create a welcome
message string and make an API call to Amazon Polly to generate a voice prompt.  That voice prompt will be a recording stored on an account S3 bucket.  The lambda
will then reply to the SMA will instructions to do two things:  play the voice prompt audio file, and record the callers response.  In the code the period of silence
at the end of the caller speaking is set to 2 seconds and the level of background noise is set to 200.  The maximum period of the recording will be 15 seconds. These are set 
in src/index.js as follows:

```javascript
// these control the recording of the users voice commands
const messageMaximumLengthInSeconds = 15;
// this is how long of silence is needed to end recording
const silenceDurationInSeconds = 2.0;
// this controls the 'background threshold' for detecting silence
const silenceThreshold = 200;
```

When the SMA has played the audio and recorded the response, it sends an ACTION_SUCCESSFUL message to the lambda.  It takes that information and sends it to the second
lambda function (LexLambda) and replies to the SMA to play a "masking audio" file to provide audible feedback to the caller that it's working.

The LexLambda reads the recording and processes it into a suitable format and then sends that recording to Lex.  We needed a second lambda because Lex (v1) has a
synchronous interface.  It expects to get audio and reply with the next prompt.  However, we want to play masking audio on the SMA while this happens so we use a 
second lambda to do that work.  Lex responds with a text string of the reply phrase and the lambda makes a call to Amazon Polly to encode it into a voice recording.  
When it's ready, the Lex Lambda makes an "UpdateSipMediaApplication" API call using the Amazon Chime SDK, providing the details on the call that needs updating and 
the details on the new file (in S3) to use for a follow-on prompt.  If Lex determined that the Bot has collected all needed data (Fullfilment) then it sets an 'endFlag' 
in the call to the SMA.  

The SMA then makes a CALL_UPDATE_REQUESTED call to the application lambda with the details provided in the UpdateSipMediaApplication call.  The SMA then repeats
the same sequence, collecting data for each slot in the Lex Bot.  If the 'endFlag' is set then the lambda plays a final goodbye recording and hangs up.

Please be aware that for the sake of brevity one SMA call to the application lambda was ommitted.  When the masking audio playback is interupted as a result of 
the SMA receiving the UpdateSipMediaApplication call the SMA will send an ACTION_INTERRUPTED call to the lambda.  In this demo the lambda just ignores that call.
More sophisticated applications, however, could make use of that information to perhaps take a different action or generate necessary logs.
