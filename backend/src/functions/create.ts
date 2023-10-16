import {APIGatewayProxyHandler} from "aws-lambda";
import {PutCommand} from "@aws-sdk/lib-dynamodb";
import {ddb} from "../lib/ddb-client";
import {ulid} from "ulid";

export const handler: APIGatewayProxyHandler = async (event) => {
    const authKey = event.queryStringParameters?.authKey;
    if (!authKey || authKey != process.env.AUTH_KEY) {
        return {
            statusCode: 200,
            headers: {"Content-Type": "text/html"},
            body: `You're not authorized to use this page.`,
        };
    }

    const id = ulid();
    await ddb.send(new PutCommand({
        TableName: process.env.TABLE,
        Item: {
            pk: 'vending-codes',
            sk: `${id}`,
            created: new Date().toISOString(),
        }
    }));

    return {
        statusCode: 200,
        headers: {"Content-Type": "text/plain"},
        body: `${process.env.API_URL}/redeem?code=${id}`,
    };
};