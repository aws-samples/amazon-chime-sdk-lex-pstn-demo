# Simplified API Call Flow

This solution uses Chime SDK PSTN Audio solution as well as two lambda functions.  It also uses Amazon Polly to generate voice
prompts and Amazon Lex to interpret caller requests.  Recordings of caller requests and system audio responses are stored in an Amazon S3 bucket in the account.

The basic sequence of API operations is shown below:

![](images/callflow.drawio.svg?raw=true)

1.	A caller dials the application phone number causing the PSTN audio service to invoke appLambda with a NEW_INBOUND_CALL event. 
2.	appLambda creates a welcome message string and calls the Amazon Polly API to generate a voice prompt. That voice prompt recording is stored in an account S3 bucket. 
3.	appLambda then replies to the PSTN audio service with instructions to do two things: play the voice prompt audio file, and record the caller’s response. 
4.	The PSTN Audio service performs those actions and then sends ACTION_SUCCESSFUL to appLambda when the recording is complete.  In this demo the “detection threshold” period of silence at the end of the caller speaking is set to 2 seconds and the level of background noise that is “silence” is set to 200dB. The maximum period of the recording will be 15 seconds. These values can be changed by editing their values in the code file src/index.js and the range of allowed values are described in the documentation.

```javascript
// these control the recording of the users voice commands
const messageMaximumLengthInSeconds = 15;
// this is how long of silence is needed to end recording
const silenceDurationInSeconds = 2.0;
// this controls the 'background threshold' for detecting silence
const silenceThreshold = 200;
```

5.	The appLambda passes the event to the lexLambda for processing.
6.	To let the caller know that action is happening, appLambda sends an action to the PSTN Audio service to play an audio file to “mask” the processing latency.
7.	The lexLambda reads the recording from S3, processes it into a suitable format and then sends that recording to Lex. Lex responds with a text string of the reply phrase and the lexLambda makes a call to Amazon Polly to encode it into a voice recording, which is stored back in the S3 bucket.
8.	The lexLambda then calls UpdateSipMediaApplication with the details on the call that needs updating and the location of the new audio file to use for a follow-on prompt. If Lex determined that the Bot has collected all needed data then it also sets an 'endFlag.’
9.	The PSTN Audio service then sends a CALL_UPDATE_REQUESTED event to appLambda with the details passed to it by the UpdateSipMediaApplication call. 
10.	appLambda then repeats the same sequence, collecting data for each slot in the Lex Bot. If the 'endFlag' is set then the appLambda plays a final goodbye recording and hangs up.

Please be aware that for the sake of brevity one call to the appLambda was omitted. When the masking audio playback is interrupted as a result of the the PSTN audio service receiving the UpdateSipMediaApplication API call, the service will invoke appLambda with an ACTION_INTERRUPTED event.  In this demo the appLambda just ignores that call. More sophisticated applications, however, could make use of that information to perhaps take a different action or generate necessary logs.
