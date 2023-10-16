import {APIGatewayProxyHandler} from "aws-lambda";
import {GetCommand, QueryCommand, UpdateCommand} from "@aws-sdk/lib-dynamodb";
import {ddb, getPaginatedResults} from "../lib/ddb-client";

export const handler: APIGatewayProxyHandler = async (event) => {
    const code = event.queryStringParameters?.code;
    if (!code) {
        return {
            statusCode: 200,
            headers: {"Content-Type": "text/html"},
            body: `Please enter the full URL that you received. The code is missing.`,
        };
    }

    const codeRecord: any = (await ddb.send(new GetCommand({
        TableName: process.env.TABLE,
        Key: {
            pk: 'vending-codes',
            sk: `${code}`
        }
    }))).Item;
    if (!codeRecord) {
        return {
            statusCode: 200,
            headers: {"Content-Type": "text/html"},
            body: `Couldn't find the code. Did you copy and paste the URL that you received?`,
        };
    }

    if (codeRecord.used) {
        return {
            statusCode: 200,
            headers: {"Content-Type": "text/html"},
            body: `This code has already been used.`,
        };
    }

    const response: string[] = [];
    const pick = event.queryStringParameters?.pick;
    if (pick) {
        const pickResults = (await ddb.send(new QueryCommand({
            TableName: process.env.TABLE,
            KeyConditionExpression: 'pk = :pk and begins_with(sk, :sk)',
            ExpressionAttributeValues: {
                ':pk': `eve-codes`,
                ':sk': `${pick}`
            },
            Limit: 1
        }))).Items ?? [];
        if (pickResults.length == 0) {
            return {
                statusCode: 200,
                headers: {"Content-Type": "text/plain"},
                body: "It looks like there are no more of this type available. Please try again with a different pick. Your code is still valid."
            };
        } else {
            await ddb.send(new UpdateCommand({
                TableName: process.env.TABLE,
                Key: {
                    pk: 'vending-codes',
                    sk: `${code}`,
                },
                UpdateExpression: 'set #used = :used',
                ExpressionAttributeNames: {
                    '#used': 'used',
                },
                ExpressionAttributeValues: {
                    ':used': new Date().toISOString(),
                }
            }));
            const pickResult = pickResults[0];
            await ddb.send(new UpdateCommand({
                TableName: process.env.TABLE,
                Key: {
                    pk: pickResult.pk,
                    sk: pickResult.sk,
                },
                UpdateExpression: 'set #used = :used',
                ExpressionAttributeNames: {
                    '#used': 'used',
                },
                ExpressionAttributeValues: {
                    ':used': new Date().toISOString(),
                }
            }));

            response.push(...[
                `Congratulations! Here's your code:`,
                ``
                    `${pickResult.code}`,
                ``
                    `You can redeem the code at https://secure.eveonline.com/activation/`,
            ])
        }
    } else {
        const eveCodes: any[] = await getPaginatedResults(async (ExclusiveStartKey: any) => {
            const queryResponse = await ddb
                .send(new QueryCommand({
                    TableName: process.env.TABLE,
                    KeyConditionExpression: 'pk = :pk',
                    ExpressionAttributeValues: {
                        ':pk': `eve-codes`,
                    },
                    ExclusiveStartKey,
                }));

            return {
                marker: queryResponse.LastEvaluatedKey,
                results: queryResponse.Items,
            };
        });

        const codeTypes: { name: string, id: string }[] = [];
        const seenNames = new Set<string>();
        for (const eveCode of eveCodes) {
            if (seenNames.has(eveCode.name)) {
                codeTypes.push({
                    id: eveCode.id,
                    name: eveCode.name,
                })
                seenNames.add(eveCode.name);
            }
        }

        response.push(...[
            `Here's what we have available for you. Choose one, and click the link to redeem your code:`,
            ``,
            `<ul>`,
        ])

        for (const codeType of codeTypes) {
            response.push(`<li><a href="${process.env.API_URL}?code=${code}&pick=${codeType.id}">${codeType.name}</a></li>`)
        }

        response.push(`</ul>`);
    }

    return {
        statusCode: 200,
        headers: {"Content-Type": "text/plain"},
        body: response.join('\n'),
    };
};
