STACKNAME := ChimeSdkPstnCdkLexDemo
CDK-OUT   := cdk-outputs.json
DUMMY     := $(shell touch ${CDK-OUT})
LOGDIR    := ./oldlogs
OLDLOG	  := ${LOGDIR}/cdk-outputs-$(shell date +%FT%T%Z).json

LAMBDALOG := $(shell jq .${STACKNAME}.lambdaLog ${CDK-OUT})
LAMBDAARN := $(shell jq .${STACKNAME}.lambdaARN ${CDK-OUT})

IN_EVENT  := ./test/in.json
OUT_JSON  := ./out/out.json

SUBDIRS   := ../amazon-chime-sdk-pstn-provider src lexLambda

QUOTE     := ' # this is a hack to get the command line to render correctly for cleardb target

dummy:
	@echo "usage: make build | deploy | keepdeploy | destroy | clean"

deps:
	nvm install -g npm nodejs typescript aws-sdk

init:
	cdk init --language=typescript

subdirs: 
	for dir in $(SUBDIRS); do $(MAKE) -C $$dir; done

build: clean subdirs modules-install
	@npm run build

modules-install:
	npm install --save

deploy: build
	cdk deploy --outputs-file ./cdk-outputs.json --require-approval never

keepdeploy: build
	cdk deploy --outputs-file ./cdk-outputs.json --no-rollback --require-approval never --verbose

destroy: 
	-@mkdir ${LOGDIR}
	cp cdk-outputs.json ${OLDLOG}
	cdk destroy --force

logs:
	aws logs tail $(LAMBDALOG) --follow --format short 

logs-info:
	aws logs tail $(LAMBDALOG) --follow --format short --filter-pattern INFO

clean: check_clean
	-@rm -Rf *~
	-@rm -Rf cdk-outputs.json
	-@rm -Rf lib/*.js lib/*.d.ts
	-@rm -Rf test/*.js test/*.d.ts
	-@rm -Rf node_modules
	-@rm -Rf package-lock.json
	-@rm -Rf src/layer/nodejs/node_modules
	-@rm -Rf lexLambda/layer/nodejs/node_modules

check_clean:
	@echo -n "This will lose all CDK state data.  Are you sure? [y/N] " && read ans && [ $${ans:-N} = y ]


invoke:
	-@mkdir out
	@echo ${LAMBDAARN}
	jq . ${IN_EVENT}
	aws lambda invoke --function-name ${LAMBDAARN} --cli-binary-format raw-in-base64-out --payload file://${IN_EVENT} ${OUT_JSON} --no-paginate 2>&1 > /dev/null
	jq . ${OUT_JSON}

cleardb:
	$(eval TABLENAME := $(shell jq .${STACKNAME}.chimeSdkPstnInfoTable ${CDK-OUT}))
	$(eval PHONENUM  := $(shell  aws dynamodb scan --table-name ${TABLENAME} | jq -r .Items[0].phoneNumber.S ))
	$(eval DELKEY    := $(shell jq '.phoneNumber.S = "${PHONENUM}"' ./test/delete.json ))  
	$(eval COUNT := $(shell aws dynamodb scan --table-name ${TABLENAME} --select "COUNT" | jq .Count ))
	number=1 ; while [[ $$number -le ${COUNT} ]] ; do \
		aws dynamodb delete-item --table-name ${TABLENAME} --key ${QUOTE}${DELKEY}${QUOTE}; echo $$number ; ((number = number + 1)) ; \
	done

