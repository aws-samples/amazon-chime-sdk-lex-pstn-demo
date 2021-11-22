# Setting Up the Lex (v1) Order Flowers Demo

Navigate to the AWS Lex console.  For example, if you are in the us-west-2 region, your consoled would be [here](https://us-west-2.console.aws.amazon.com/lex/home?region=us-west-2#bot-create:).  
Select the "Order Flowers" demo.  Accept the default bot name of "OrderFlowers" and choose what language you want the bot to understand.  Select answers to the other questions and enter a 
value for the Confidence Score Threshold.

![](images/flowerstorebot.png?raw=true)

NOTE:  Amazon Lex will use the recorded audio provided to it to improve it's service.  You can disable this by selecting "No" for Advanced Options.  For more information, read 
["AI services opt-out policies"](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_ai-opt-out.html)

When you have entered all the values, click the Create button.

You will be taken to a page to configure the bot.  For this demo we will use all the default values.  The bot will take a few moments to build.  When it is ready, you can click the "Publish"
button.  

You will be prompted to enter an Alias.  Enter "PROD" (in all caps). 

![](images/alias.png?raw=true)

Then click "Publish" and your bot will be available in a few moments.

If you named your bot OrderFlowers, set the language to be English (US) and set the alias to PROD then you won't have to make any changes to the source code of the Chime SDK demo.

##  Different Bot Name or Alias Name

If you use a different name, language or alias name, you will need to edit the file lexLambda/index.js to match the names you chose:

```typescript
/ change these to match your Lex bot
const lexBotName = 'OrderFlowers';  // change here
const lexBotAlias = 'PROD';         // change here
```

Note: choosing another language will add a suffix to the bot name, e.g. "OrderFlowers_en_GB" if English (UK) is chosen.

# Disclaimer

Deploying the Amazon Chime SDK demo application contained in this repository will cause your AWS Account to be billed for services, including the Amazon Chime SDK, used by the application.
## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0

