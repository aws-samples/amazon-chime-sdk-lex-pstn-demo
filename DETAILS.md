# Details and In-Depth Instructions

### AWS CDK

There are three parts to this repo: the CDK automation scripting (in the 'lib' folder), the actual sample application itself (in the 'src' folder, and a CloudFormation Custom 
Resource Provider (in a parallel folder).

### Custom Provider

This repo requires a parallel repo that contains the [amazon-chime-sdk-pstn-provider](https://github.com/aws-samples/amazon-chime-sdk-pstn-provider) Custom Resource Provider. 
This may eventually move to become a git submodule, but today the code expects it to be parallel to this repo. If it is not, you can make the change in lib/chime_sdk_pstn_cdk-stack.ts:

```typescript
// default custom provider is in a parallel folder
// keeping it separate so that it can evolve independently
const chimeSdkPstnProviderDir = `${path.resolve(
  __dirname
)}/../../amazon-chime-sdk-pstn-provider`;
const ChimeSdkPstnProviderHandler = "index.handler";
```

The custom provider currently only supports the creation of one Phone Number, one SMA, and one SIP Rule at this time.

### Example PSTN Application

The sample app is in the 'src' directory.  If you call it's Phone Number it will detect the number you called from.  If it recoginized the number, it will say "welcome back" and if
it does not recognize the number it will read back the number you are calling from.  It then speaks the time (in UCT) and says goodbye and hangs up.

Read more about the [API call flow here](https://github.com/aws-samples/amazon-chime-sdk-lex-pstn-demo/blob/main/API-CALL-FLOW.md). 

The code is in src/index.js.  This demo shows how to answer the phone, use Amazon Polly to create voice prompts and play them back over an Amazon Chime SDK SIP Media Appliance (SMA).
The app is writte in javascript.  The CDK code is in typescript.  To prevent the CDK from trying to treat the app code as typescript it's folder is specifically excluded 
from the 'tsc' build process via the top level tsconfig.json file:

```json
 "exclude": [
    "node_modules",
    "cdk.out",
    "src"
  ]
```
### Cloud Development Kit (CDK) 

The CDK script is located in the 'lib' folder.  More information on the CDK is available [here](https://aws.amazon.com/cdk/);

### Makefile

This repo makes use of "make" and the Makefile is a handy way to handle dependencies and document commands. It also makes it super easy to use.

### Node Modules

The Makefile will handle downloading the node modules for you.  However, if you want to trigger that manually you can:
Before deploying, you must install the modules needed for the sample app:

```bash
make modules-install
```
### Depoloying

You can manually deploy the working solution with:

```bash
make deploy
```

### Cleanup

You can clean up everything with:

```
make destroy
```

### Other Helpers

You can get a tail on the logs with:

```
make logs
```

These update fairly slowly so be patient and wait 60 seconds if you think it's not working.

### Invoking just the lambda function directly without going through the SMA

You can test the functionality of the lamba directly by:

```
make invoke
```

This will use the file "test/in.json" as a sample input to the function. This is useful to ensure that your code is actually invoking properly with no javascript errors.

### Clearing Call Records from DynamoDB

You can clear call records from the database by:

```bash
make cleardb
```

## Disclaimer

Deploying the Amazon Chime SDK demo application contained in this repository will cause your AWS Account to be billed for services, including the Amazon Chime SDK, used by the application.
## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
