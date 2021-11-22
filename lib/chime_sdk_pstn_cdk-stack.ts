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

import * as cdk from '@aws-cdk/core';
import s3 = require('@aws-cdk/aws-s3');
import s3deploy = require('@aws-cdk/aws-s3-deployment')
import iam = require('@aws-cdk/aws-iam')
import lambda = require('@aws-cdk/aws-lambda');
import custom = require('@aws-cdk/custom-resources')
import sqs = require('@aws-cdk/aws-sqs');

import * as ddb from '@aws-cdk/aws-dynamodb';
import { FromCloudFormationPropertyObject } from '@aws-cdk/core/lib/cfn-parse';
import { ChimeClient } from '@aws-sdk/client-chime';
import { stringify } from 'querystring';
import * as path from 'path';

// These are the configuration variables for your PhoneNumbers
const chimeSdkVariables = {
  sipTriggerType: 'ToPhoneNumber',
  phoneNumberRequired: true,
  phoneAreaCode: '505',
  phoneState: '',
  phoneCountry: '',
  phoneNumberType: 'SipMediaApplicationDialIn',
  phoneNumberTollFreePrefix: '',
}

// the masking audio file we are using to hide latency
const audioMaskFileKey = "442989-birds-chirping-edited-65.wav";
// audio file is licensed Creative Commons - see LICENSE.md file in the wav_files folder


// default custom provider is in a parallel folder
// keeping it separate so that it can evolve independently
const chimeSdkPstnProviderDir = `${path.resolve(__dirname)}/../../amazon-chime-sdk-pstn-provider/dist`;
const ChimeSdkPstnProviderHandler = "index.handler"
// default folder for libraries to be included as a lambda layer for the provider
const providerLayerFolder = `${path.resolve(__dirname)}/../../amazon-chime-sdk-pstn-provider/layer`;

// default telephony lambda is in the src folder - just example code
const chimeSdkPstnLambdaDir = `${path.resolve(__dirname)}/../src/`;
const ChimeSdkPstnLambdaHandler = "index.handler";
// default folder for libraries to be included as a lambda layer
const appLayerFolder = `${path.resolve(__dirname)}/../src/layer`;
// you can change the above to point to a different source folder for your application
// this allows you to develop your application in it's own folder/repo and iterate
// independently of the CDK code that deploys it
// this will evolve further to allow definition of a json file for the telephony
// assets that are desired so that the user does not need to write much CDK code


export class ChimeSdkPstnCdkLexDemo extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    const deadLetterQueue = new sqs.Queue(this, 'deadLetterQueue');

    // create a bucket for the recorded wave files and set the right policies
    const wavFiles = new s3.Bucket(this, 'wavFiles', {
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });
    const wavFileBucketPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:PutObjectAcl'
      ],
      resources: [
        wavFiles.bucketArn,
        `${wavFiles.bucketArn}/*`
      ],
      sid: 'SIPMediaApplicationRead',
    });
    wavFileBucketPolicy.addServicePrincipal('voiceconnector.chime.amazonaws.com');
    wavFiles.addToResourcePolicy(wavFileBucketPolicy);

    // deploy the pre-recorded audio files to S3
    new s3deploy.BucketDeployment(this, 'WavDeploy', {
      sources: [s3deploy.Source.asset('./wav_files')],
      destinationBucket: wavFiles,
      contentType: 'audio/wav'
    });

    // create roles for lambdas to run as, then grant permissions for services
    const smaLambdaRole = new iam.Role(this, 'smaLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    smaLambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));

    const smaLambdaLexRole = new iam.Role(this, 'smaLambdaLexRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    smaLambdaLexRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));


    // create a role and policies for Polly
    const pollyRole = new iam.Role(this, 'pollyRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    const pollyPolicyDoc = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["polly:SynthesizeSpeech"],
          resources: ["*"], // GCH scope this down
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["s3:PutObject", "s3:ListObject"],
          resources: [`${wavFiles.bucketArn}/*`],
        }),
      ],
    });
    const pollyPolicy = new iam.Policy(this, 'pollyPolicy', {
      document: pollyPolicyDoc
    });

    // allow the lambda to interact with polly
    smaLambdaRole.attachInlinePolicy(pollyPolicy);

    // create a policy allowing interaction with Lex
    const lexPolicyDoc = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "lex:PostContent",
            "lex:PostText",
            "lex:PutSession",
            "lex:GetSession",
            "lex:DeleteSession",
            "lex:RecognizeText",
            "lex:RecognizeUtterance",
            "lex:StartConversation",],
          resources: ["*"], // scope this down GCH
        }),
      ],
    });
    const lexPolicy = new iam.Policy(this, 'lexPolicy', {
      document: lexPolicyDoc
    });

    // allow the Lex lambda to ineract with Lex
    smaLambdaLexRole.attachInlinePolicy(lexPolicy);

    // create a policy allowing interaction with Chime
    const chimePolicyDoc = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "chime:UpdateSipMediaApplicationCall",
          ],
          resources: ["*"],  // GCH scope this down if possible
        }),
      ],
    });
    const chimePolicy = new iam.Policy(this, 'chimePolicy', {
      document: chimePolicyDoc,
    });

    // allow the Lex lambda to interact with chime
    smaLambdaLexRole.attachInlinePolicy(chimePolicy);

    // allow the Lex lambda to interact with polly
    smaLambdaLexRole.attachInlinePolicy(pollyPolicy);

    // create the lambda layer to hold routine libraries
    const lambdaLayer = new lambda.LayerVersion(this, 'appLambdaLayer', {
      code: lambda.Code.fromAsset(path.join(appLayerFolder)),
      compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
      description: 'App Lambda Layer',
    });

    // create the lambda function that does the call handling
    const chimeSdkPstnLambda = new lambda.Function(this, 'ChimeSdkPstnLambda', {
      code: lambda.Code.fromAsset(chimeSdkPstnLambdaDir, { exclude: ["README.md", "*.ts", "*.json", "Makefile", "layer"] }),
      handler: ChimeSdkPstnLambdaHandler,
      runtime: lambda.Runtime.NODEJS_14_X,
      environment: {
        WAVFILE_BUCKET: wavFiles.bucketName,
      },
      role: smaLambdaRole,
      layers: [lambdaLayer],
      timeout: cdk.Duration.seconds(60),
      description: `Generated on: ${new Date().toISOString()}`,
    });


    // default lex lambda is in the lexLambda folder 
    const chimeSdkLexLambdaDir = `${path.resolve(__dirname)}/../lexLambda/`;
    const ChimeSdkLexLambdaHandler = "index.handler";
    // default folder for libraries to be included as a lambda layer
    const lexLayerFolder = `${path.resolve(__dirname)}/../lexLambda/layer`;

    // LEX LAMBDA LAYER - create the lambda layer to hold routine libraries for the Lex Lambda
    const lexLayer = new lambda.LayerVersion(this, 'lexLambdaLayer', {
      code: lambda.Code.fromAsset(path.join(lexLayerFolder,)),
      compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
      description: 'Lex Layer',
    });

    // LEX LAMBDA - create the lambda function that talks to lex
    const chimeSdkLexLambda = new lambda.Function(this, 'ChimeSdkLexLambda', {
      code: lambda.Code.fromAsset(chimeSdkLexLambdaDir, { exclude: ["README.md", "*.ts", "*.json", "Makefile", "layer"] }),
      handler: ChimeSdkLexLambdaHandler,
      runtime: lambda.Runtime.NODEJS_14_X,
      environment: {
        WAVFILE_BUCKET: wavFiles.bucketName,
      },
      role: smaLambdaLexRole,
      layers: [lexLayer],
      timeout: cdk.Duration.seconds(60),
      description: `Generated on: ${new Date().toISOString()}`,
    });

    // allow the Lex Lambda to read from the S3 bucket
    const grant = wavFiles.grantRead(chimeSdkLexLambda);

    // create a policy allowing invoction of the lex lambda function and attach it to the SMA Call handling lambda
    const lambdaPolicyDoc = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["lambda:InvokeFunction"],
          resources: [chimeSdkLexLambda.functionArn],
        }),
      ],
    });
    const lambdaPolicy = new iam.Policy(this, 'lexPollicy', {
      document: lambdaPolicyDoc
    });
    smaLambdaRole.attachInlinePolicy(lambdaPolicy);

    // create the lambda layer to hold routine libraries for the Custom Provider
    const providerLayer = new lambda.LayerVersion(this, 'providerLambdaLayer', {
      code: lambda.Code.fromAsset(path.join(providerLayerFolder,)),
      compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
      description: 'Provider Lambda Layer',
    });

    const chimeCreateRole = new iam.Role(this, 'createChimeLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['chimePolicy']: new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            resources: ['*'],
            actions: ['chime:*',
              'lambda:GetPolicy',
              'lambda:AddPermission',
              'cloudformation:DescribeStacks',
              'cloudformation:DescribeStackEvents',
              'cloudformation:DescribeStackResource',
              'cloudformation:DescribeStackResources',]
          })]
        })
      },
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")]
    });

    // create the lambda for CDK custom resource to deploy SMA, etc.
    const chimeProviderLamba = new lambda.Function(this, 'chimeSdkPstnProviderLamba-', {
      code: lambda.Code.fromAsset(chimeSdkPstnProviderDir, { exclude: ["README.md", "*.ts"] }),
      handler: ChimeSdkPstnProviderHandler,
      runtime: lambda.Runtime.NODEJS_14_X,
      role: chimeCreateRole,
      layers: [providerLayer],
      timeout: cdk.Duration.seconds(180),
    });

    // now create the custom provider
    const chimeProvider = new custom.Provider(this, 'chimeProvider', {
      onEventHandler: chimeProviderLamba,
    });

    // major configuration properties for the Chime SDK resources
    const chimeProviderProperties = {
      lambdaArn: chimeSdkPstnLambda.functionArn,
      region: this.region,
      smaName: this.stackName,
      sipRuleName: this.stackName,
      sipTriggerType: chimeSdkVariables.sipTriggerType,
      phoneNumberRequired: chimeSdkVariables.phoneNumberRequired,
      phoneAreaCode: chimeSdkVariables.phoneAreaCode,
      phoneState: chimeSdkVariables.phoneState,
      phoneCountry: chimeSdkVariables.phoneCountry,
      phoneNumberType: chimeSdkVariables.phoneNumberType,
      phoneNumberTollFreePrefix: chimeSdkVariables.phoneNumberTollFreePrefix,
    }
    console.log(chimeProviderProperties);
    console.log(chimeProvider.serviceToken);

    const inboundSMA = new cdk.CustomResource(this, 'inboundSMA', {
      serviceToken: chimeProvider.serviceToken,
      properties: chimeProviderProperties,
    });


    // create the DynamoDB database
    const callInfoTable = new ddb.Table(this, 'callInfo', {
      partitionKey: {
        name: 'phoneNumber',
        type: ddb.AttributeType.STRING
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      stream: ddb.StreamViewType.NEW_IMAGE
    });
    // GCH add encryption here, and cover the need for that in the README/Blog

    // enable the Lambda function to access the DynamoDB table (using IAM)
    callInfoTable.grantFullAccess(chimeSdkPstnLambda)

    // put the table name in the lambda environment
    chimeSdkPstnLambda.addEnvironment('CALLINFO_TABLE_NAME', callInfoTable.tableName);
    chimeSdkPstnLambda.addEnvironment('AUDIO_MASK_FILE', audioMaskFileKey);
    chimeSdkPstnLambda.addEnvironment('LEX_LAMBDA', chimeSdkLexLambda.functionArn);
    chimeSdkLexLambda.addEnvironment('AUDIO_MASK_FILE', audioMaskFileKey);

    // these are the attributes returned from the custom resource!
    const inboundPhoneNumber = inboundSMA.getAttString('phoneNumber');
    const smaID = inboundSMA.getAttString("smaID");
    const sipRuleID = inboundSMA.getAttString("sipRuleID");
    const phoneID = inboundSMA.getAttString("phoneID");

    // Write the Telephony Handling Data to the output
    new cdk.CfnOutput(this, 'inboundPhoneNumber', {
      value: inboundPhoneNumber,
      exportName: this.stackName + '-inboundPhoneNumber',
    });
    new cdk.CfnOutput(this, 'chimeProviderLog', {
      value: chimeProviderLamba.logGroup.logGroupName,
      exportName: this.stackName + '-chimeProviderLog'
    });
    new cdk.CfnOutput(this, 'lambdaLog', {
      value: chimeSdkPstnLambda.logGroup.logGroupName,
      exportName: this.stackName + '-lambdaLog',
    });
    new cdk.CfnOutput(this, 'lambdaLexLog', {
      value: chimeSdkLexLambda.logGroup.logGroupName,
      exportName: this.stackName + '-lambdaLexLog',
    });
    new cdk.CfnOutput(this, 'region', {
      value: this.region,
      exportName: this.stackName + '-region',
    });
    new cdk.CfnOutput(this, 'lambdaARN', {
      value: chimeSdkPstnLambda.functionArn,
      exportName: this.stackName + '-lambdaARN'
    });
    new cdk.CfnOutput(this, "smaID", {
      value: smaID,
      exportName: this.stackName + '-smaID',
    });
    new cdk.CfnOutput(this, "phoneID", {
      value: phoneID,
      exportName: this.stackName + '-phoneID'
    });
    new cdk.CfnOutput(this, "sipRuleID", {
      value: sipRuleID,
      exportName: this.stackName + '-sipRuleID',
    });
    new cdk.CfnOutput(this, "sipRuleName", {
      value: chimeProviderProperties.sipRuleName,
      exportName: this.stackName + '-sipRuleName',
    });
    new cdk.CfnOutput(this, "lambdaLayerArn", {
      value: lambdaLayer.layerVersionArn,
      exportName: this.stackName + '-lambdaLayerArn',
    });

    new cdk.CfnOutput(this, "wavFilesBucketName", {
      value: wavFiles.bucketName,
      exportName: this.stackName + '-wavFilesBucketName',
    });
    new cdk.CfnOutput(this, 'chimeSdkPstnInfoTable', { value: callInfoTable.tableName });
  }

}
exports.ChimeSdkPstnCdkLexDemo = ChimeSdkPstnCdkLexDemo;

