import * as cdk from 'aws-cdk-lib';
import {Duration} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {AttributeType, BillingMode, Table} from "aws-cdk-lib/aws-dynamodb";
import {LambdaIntegration, RestApi} from "aws-cdk-lib/aws-apigateway";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {Architecture, Runtime} from "aws-cdk-lib/aws-lambda";

export class BackendStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps & { authKey: string }) {
        super(scope, id, props);

        const table = new Table(this, 'Table', {
            billingMode: BillingMode.PAY_PER_REQUEST,
            partitionKey: {
                name: 'pk',
                type: AttributeType.STRING,
            },
            sortKey: {
                name: 'sk',
                type: AttributeType.STRING,
            },
        });

        const api = new RestApi(this, "giveaway-vending-machine-api", {
            restApiName: "Giveaway Vending Machine",
        });

        const createCodeFunction = this.createFunction({
            name: 'CreateCode',
            path: './src/functions/create.ts',
            environment: {
                TABLE: table.tableName,
                AUTH_KEY: props?.authKey ?? '',
                API_URL: api.url
            },
        });
        table.grantWriteData(createCodeFunction);
        const createCodeIntegration = new LambdaIntegration(createCodeFunction, {
            requestTemplates: {"application/json": '{ "statusCode": "200" }'}
        });
        const createCodeResource = api.root.addResource("create");
        createCodeResource.addMethod("GET", createCodeIntegration);

        const redeemCodeFunction = this.createFunction({
            name: 'RedeemCode',
            path: './src/functions/redeem.ts',
            environment: {
                TABLE: table.tableName,
            },
        });
        table.grantReadWriteData(redeemCodeFunction);
        const redeemCodeIntegration = new LambdaIntegration(redeemCodeFunction, {
            requestTemplates: {"application/json": '{ "statusCode": "200" }'}
        });
        const redeemCodeResource = api.root.addResource("redeem");
        redeemCodeResource.addMethod("GET", redeemCodeIntegration);
    }

    private createFunction(props: {
        name: string,
        path: string,
        environment?: { [key: string]: string },
    }) {
        return new NodejsFunction(this, props.name, {
            entry: props.path,
            environment: props.environment,
            bundling: {
                sourceMap: true,
                externalModules: [
                    'aws-sdk'
                ],
            },
            awsSdkConnectionReuse: true,
            architecture: Architecture.ARM_64,
            timeout: Duration.seconds(10),
            runtime: Runtime.NODEJS_18_X,
            memorySize: 256,
        });
    }
}
