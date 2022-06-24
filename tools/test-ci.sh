#!/bin/bash
mkdir -p coverage
npm run tap -Rclassic

code=$?
cat .tap-output | ./node_modules/.bin/tap-mocha-reporter xunit > coverage/test.xml
exit $code
