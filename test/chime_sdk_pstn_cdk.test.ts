import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as ChimeSdkPstnCdk from '../lib/chime_sdk_pstn_cdk-stack';

test('Empty Stack', () => {
  const app = new cdk.App();
  // WHEN
  const stack = new ChimeSdkPstnCdk.ChimeSdkPstnCdkLexDemo(app, 'MyTestStack');
  // THEN
  expectCDK(stack).to(matchTemplate({
    "Resources": {}
  }, MatchStyle.EXACT))
});
