# Amazon Chime SDK PSTN Lex Demo

This repo derived from a [basic template for a Chime SDK PSTN application](https://github.com/aws-samples/amazon-chime-sdk-pstn-cdk). 

## What does it Do?

This deploys an AWS allocated Phone Number and attaches a simple IVR application that is integrated to [Amazon Lex](https://aws.amazon.com/lex/).  

As a prerequisite, you must first set up a Lex (v1) 'Flower Demo' bot in the AWS console for your account.  Ensure you use Lex v1.  The name of your bot should be named 'OrderFlowers' and you should create an alias to it called 'PROD' in order for the code to work as configured.  Detailed instructions for setting up that bot are [here](https://github.com/aws-samples/amazon-chime-sdk-lex-pstn-demo/blob/main/SETUP-LEX.md).

When you call the phone number created by this application the caller is prompted to answer a series of questions to order flowers from a fictitious "Flower Store," all using only voice prompts.

## Configuring your AWS Account

You need to configure your [AWS Account parameters](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html) to enable deploying the application.  The easiest way
to ensure that you have it configured properly do this:

```bash
aws sts get-caller-identity
```

You should get information about your valid AWS account.
## Installing Application Dependencies

On a clean linux instance, you need to install the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), [jq](https://stedolan.github.io/jq/download/) and 
the [Node Version Manager (nvm)](https://github.com/nvm-sh/nvm).  You can then use nvm to install the other dependendencies (nodejs typescript aws-sdk aws-cdk).  An example of the commands
to install on Amazon Linux (or other yum-based linux) is [here](https://github.com/aws-samples/amazon-chime-sdk-lex-pstn-demo/SETUP-DEPS.md).  

An example of the commands to install on Amazon Linux (or other yum-based linux) is [here](https://github.com/aws-samples/amazon-chime-sdk-lex-pstn-demo/SETUP-DEPS.md).  However, please
always reference those tools instalation instructions if needed.
## Batteries Included, Just Show Me Already!

Once you have set up the Amazon Lex bot and installed the dependencies, if you just want to go for it you can run the "deploy.sh" script.  It will call the make commands to deploy the sample app.  It's output will 
include the application telephone number.
## Output

This application includes full deployment automation using the AWS CDK.  When you deploy it, all needed resources will be created in your AWS account.  When the script completes 
you will get something like this in your terminal:

```bash
✅  ChimeSdkPstnCdkLexDemo

Outputs:
ChimeSdkPstnCdkLexDemo.chimeProviderLog = /aws/lambda/ChimeSdkPstnCdkLexDemo-chimeSdkPstnProviderLambaEA-V8PYYKxUA2Z1
ChimeSdkPstnCdkLexDemo.chimeSdkPstnInfoTable = ChimeSdkPstnCdkLexDemo-callInfo84B39180-KMIWJRX121XK
ChimeSdkPstnCdkLexDemo.inboundPhoneNumber = ***** PHONE NUMBER HERE *****
ChimeSdkPstnCdkLexDemo.lambdaARN = arn:aws:lambda:us-west-2:<account number>:function:ChimeSdkPstnCdkLexDemo-ChimeSdkPstnLambda94B9E76E-8vv9dzwffup3
ChimeSdkPstnCdkLexDemo.lambdaLayerArn = arn:aws:lambda:us-west-2:<account number>:layer:appLambdaLayer43BBEA22:56
ChimeSdkPstnCdkLexDemo.lambdaLexLog = /aws/lambda/ChimeSdkPstnCdkLexDemo-ChimeSdkLexLambda18EF42AF-y4mC76QEMJj5
ChimeSdkPstnCdkLexDemo.lambdaLog = /aws/lambda/ChimeSdkPstnCdkLexDemo-ChimeSdkPstnLambda94B9E76E-8vv9dzwffup3
ChimeSdkPstnCdkLexDemo.phoneID = <PHONE ID>
ChimeSdkPstnCdkLexDemo.region = us-west-2
ChimeSdkPstnCdkLexDemo.sipRuleID = c55e5922-25bf-42d5-a3f8-e65bd314cc34
ChimeSdkPstnCdkLexDemo.sipRuleName = ChimeSdkPstnCdkLexDemo
ChimeSdkPstnCdkLexDemo.smaID = bcf784f1-c902-4b76-a1e5-7b3ae664483e
ChimeSdkPstnCdkLexDemo.wavFilesBucketName = chimesdkpstncdklexdemo-wavfiles98e3397d-ji6r5dxk3wb8

Stack ARN:
arn:aws:cloudformation:us-west-2:497939524935:stack/ChimeSdkPstnCdkLexDemo/f8298a50-48c2-11ec-84f8-02b5c6242747
```

All you need is the phone number on the line "chimeSdkPstnCdkStack.inboundPhoneNumber."  Call that number and the app will respond.

## How Does it Work?

This application makes use of two lambda functions to be able to interact quickly with the SIP Media Appliance (SMA) as well as with Amazon Lex, explained
in [this detailed description of the API call flows](https://github.com/aws-samples/amazon-chime-sdk-lex-pstn-demo/blob/main/API-CALL-FLOW.md).
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

Since this project is derived from [basic template for a Chime SDK PSTN application](https://github.com/aws-samples/amazon-chime-sdk-pstn-cdk) you can refer to that project for [much
more information on the tooling](https://github.com/aws-samples/amazon-chime-sdk-pstn-cdk#details-and-in-depth-instructions) provided by this sample app.  

## Disclaimers

Deploying the Amazon Chime SDK demo application contained in this repository will cause your AWS Account to be billed for services, including the Amazon Chime SDK, used by the application.

Please be aware that Amazon Lex will use the recorded audio provided to it to improve it's service.  You can disable this by selecting "No" for Advanced Options.  For more information, read 
["AI services opt-out policies"](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_ai-opt-out.html).

The recordings created in this demo are not encrypted, as would be recommended in a production-grade application.  
## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
