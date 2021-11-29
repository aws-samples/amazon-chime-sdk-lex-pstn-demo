# Amazon Chime SDK PSTN Audio Lex Demo

The Amazon Chime SDK Public Switched Telephone Network (PSTN) Audio service makes it easy for developers to build customized telephony applications using the agility and operational simplicity of a serverless AWS Lambda functions.  You can use the PSTN Audio service to build conversational self-service applications to reduce call resolution times and automate informational responses.

This demo will teach you how to build a conversational interactive voice response (IVR) system for a fictitious flower store that accepts orders over the phone. The voice application we build supports automatic speech recognition (ASR) and natural language understanding (NLU) using Amazon Lex, the same proven technology that powers Alexa.  This example voice application is implemented as AWS Lambda functions written in JavaScript.

This project is derived from a [basic template for an Amazon Chime SDK PSTN application](https://github.com/aws-samples/amazon-chime-sdk-pstn-cdk). 
## What does it Do?

This deploys an Phone Number allocated by the Amazon Chime SDK PSTN Audio service and attaches it to a simple IVR application that is integrated with [Amazon Lex](https://aws.amazon.com/lex/).  



When you call the phone number created by this application, you are prompted to answer a series of questions to order flowers from a fictitious "Flower Store," all using only voice prompts.

![](images/overview.drawio.svg?raw=true)

## Configuring your AWS Account

You need to install and configure the [AWS Command Line tools](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html) to enable deploying the application.  The easiest way
to ensure that you have it configured properly is do this in a terminal:

```bash
aws sts get-caller-identity
```

You should get information about your AWS account if it's set up properly.
## Installing Application Dependencies

On a clean linux instance, you need to install the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), [jq](https://stedolan.github.io/jq/download/) and 
the [Node Version Manager (nvm)](https://github.com/nvm-sh/nvm).  You can then use nvm to install the other dependendencies (nodejs typescript aws-sdk aws-cdk).

An example of the commands to install on Amazon Linux (or other yum-based linux) is [here](SETUP-DEPS.md).  However, please
always reference those tools installation instructions if needed.

## Configuration of Amazon Lex (V1)

As a prerequisite to using this demo, you must first set up a Lex (v1) 'Flower Demo' bot in the AWS console for your account (please ensure you use Lex v1).  The name of your bot should be 'OrderFlowers' and you should create an alias to it called 'PROD' in order for the code to work as configured.  Detailed instructions for setting up that bot are [here](SETUP-LEX.md).  By default, Amazon Lex stores and uses voice inputs that it has processed for the purpose of  developing and improving the service (for information, visit the AWS Service Terms for AWS Machine Learning and Artificial Intelligence Services). Amazon Lex enables customers to opt out from having content stored and used for these purposes. For this demo, please opt out from having your content stored and used by Amazon Lex.

## Batteries Included, Just Show Me Already!

Once you have set up the Amazon Lex bot and installed the dependencies, if you just want to go for it you can run the ```deploy.sh``` script.  It will call the make commands to deploy the sample app.  Its output will
include the application telephone number:

```bash
./deploy.sh
```

## Output

This application includes full deployment automation using the AWS CDK.  When you deploy it, all needed resources will be created in your AWS account.  When the script completes 
you will get something like this in your terminal:

```bash
✅  ChimeSdkPstnCdkLexDemo

Outputs:
ChimeSdkPstnCdkLexDemo.chimeProviderLog = /aws/lambda/ChimeSdkPstnCdkLexDemo-chimeSdkPstnProviderLambaEA-V8PzzzKxUA2Z1
ChimeSdkPstnCdkLexDemo.chimeSdkPstnInfoTable = ChimeSdkPstnCdkLexDemo-callInfo84B39180-KMIWRRRX121XK
ChimeSdkPstnCdkLexDemo.inboundPhoneNumber = ***** PHONE NUMBER HERE *****
ChimeSdkPstnCdkLexDemo.lambdaARN = arn:aws:lambda:us-west-2:<account number>:function:ChimeSdkPstnCdkLexDemo-ChimeSdkPstnLambda94BRR76E-8vv9dzwffup3
ChimeSdkPstnCdkLexDemo.lambdaLayerArn = arn:aws:lambda:us-west-2:<account number>:layer:appLambdaLayer43BBRR22:56
ChimeSdkPstnCdkLexDemo.lambdaLexLog = /aws/lambda/ChimeSdkPstnCdkLexDemo-ChimeSdkLexLambda18EF42AF-y4mC76QRRJj5
ChimeSdkPstnCdkLexDemo.lambdaLog = /aws/lambda/ChimeSdkPstnCdkLexDemo-ChimeSdkPstnLambda94RRE76E-8vv9dzwffup3
ChimeSdkPstnCdkLexDemo.phoneID = <PHONE ID>
ChimeSdkPstnCdkLexDemo.region = us-west-2
ChimeSdkPstnCdkLexDemo.sipRuleID = c55e5922-25bf-42d5-a3f8-e65ac314cc34
ChimeSdkPstnCdkLexDemo.sipRuleName = ChimeSdkPstnCdkLexDemo
ChimeSdkPstnCdkLexDemo.smaID = bcf784f1-c902-4b76-a1e5-7b3ae6ac483e
ChimeSdkPstnCdkLexDemo.wavFilesBucketName = chimesdkpstncdklexdemo-wavfiles98e4497d-ji6r5dxk3wb8

Stack ARN:
arn:aws:cloudformation:us-west-2:<account number>:stack/ChimeSdkPstnCdkLexDemo/f4598a50-48c2-11ec-84f8-02b5c6242747
```

All you need is the phone number on the line "ChimeSdkPstnCdkStack.inboundPhoneNumber."  Call that number and the app will respond.

## How Does it Work?

This application makes use of two lambda functions to be able to interact quickly with the Chime SDK PSTN Audio service as well as with Amazon Lex, explained
in [this detailed description of the API call flows](API-CALL-FLOW.md).
## Customizing For Your Own Use

This CDK script will create a stack named ChimeSdkPstnCdkLexDemo.  Remember that the outputs of a stack must be unique across the region that the stack is deployed to.  
These CDK outputs are named with the stack name, so if you change the name of your stack you will handle that potential conflict by default.

To make it easier for you to do this, copy and paste this snip to the command line and replace NEWNAME with your new application stack name:

```bash
export REPLACEMENT='NEWNAME'
sed -i "s/ChimeSdkPstnCdkStack/$REPLACEMENT/g" ./lib/chime_sdk_pstn_cdk-stack.ts ./bin/chime_sdk_pstn_cdk.ts Makefile
```

This will replace the name in the application with the new stack name.

## Details and In-Depth Instructions

Since this project is derived from [basic template for an Amazon Chime SDK PSTN application](https://github.com/aws-samples/amazon-chime-sdk-pstn-cdk) you can refer to that project for [much
more information on the tooling](https://github.com/aws-samples/amazon-chime-sdk-pstn-cdk#details-and-in-depth-instructions) provided by that sample app.  

## Cleanup

To clean up this demo and avoid incurring further charges do the following:

1.	In the terminal and folder where you created the demo type 

```bash
make destroy  
```

The CloudFormation stack created by the CDK will be destroyed, removing all the allocated resources.
## Disclaimers

Deploying the Amazon Chime SDK demo application contained in this repository will cause your AWS Account to be billed for services, including the Amazon Chime SDK, used by the application.

Please be aware that Amazon Lex will use the recorded audio provided to it to improve its service.  You can disable this by selecting "No" for Advanced Options.  For more information, read 
["AI services opt-out policies"](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_ai-opt-out.html).

The recordings created in this demo are not encrypted, as would be recommended in a production-grade application.  

You and your end users understand that recording Amazon Chime SDK audio with this feature may be subject to laws or regulations regarding the recording of electronic communications, and that it is your and your end users’ responsibility to comply with all applicable laws regarding the recording, including properly notifying all participants in a recorded session or to a recorded communication that the session or communication is being recorded and obtain their consent.
## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
