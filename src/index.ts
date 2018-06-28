
import * as request from 'request';
import * as util from 'util'
import * as fs from 'fs';
import * as path from 'path';

import { CoreOptions, Response } from 'request';
import { STATUS_CODES } from 'http';

const getPromise: ( uri: string, options: CoreOptions ) => Promise<Response> = util.promisify<string, CoreOptions, Response>( request.get );
const postPromise: ( uri: string, options: CoreOptions ) => Promise<Response> = util.promisify<string, CoreOptions, Response>( request.post );

const ETU_HOST: string = 'http://etu.vbtime.com';
const YM_HOST: string = 'http://api.fxhyd.cn';
const ETU_ITEM_ID: string = '20114';

const headers: { [ name: string ] : any } = {
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Encoding": "gzip, deflate",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7,zh-TW;q=0.6",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Host": "etu.vbtime.com",
    "Origin": "http://etu.vbtime.com:9091",
    "Pragma": "no-cache",
    "Referer": "http://etu.vbtime.com:9091/index.html",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36",
};

let loginToken: string = '';
const ethAddress: string = '0xd80Df6Cc3241F056BD518CC82E296C2a471';
let lastValue: number = 11111;

async function sleep( time: number ): Promise<void> {
    return new Promise<void>( ( resolve ) => {
        setTimeout( resolve , time);
    } );
}

async function sendSMSCode( phoneNumber: string ): Promise<void> {

    const url: string = `${ ETU_HOST }/auth/sendSMSCode?phoneNum=${ phoneNumber }`;
    console.log( 'sending sms code' );
    const resultContent: Response = await getPromise( url, {
        headers: headers
    } );

    const res = JSON.parse( resultContent.body );
    console.log( res );
    if ( 200 !== res.code ) {
        throw new Error( res.info );
    }

}

async function register( smsCode: string, ethAddress: string, phoneNumber: string ): Promise<void> {
    const url: string = `${ ETU_HOST }/user/register`;
    const resultContent: Response = await postPromise( url, {
        headers,
        form : {
            code: smsCode,
            phoneNum: phoneNumber,
            wallet : ethAddress,
            fromId: '411f7e5048e34a4681451049eec4edc9'
        }
    } );

    const result = JSON.parse( resultContent.body );
    console.log( result );
    if ( 200 !== result.code ) {
        throw new Error( result.info );
    }

    const data = result.data;
    const { userId, token } = data;

    writeCode( userId, token );
}

function writeCode( userId: string, token: string ) {

    const listFile: string = path.join( __dirname, '../../list.json' );
    const listContent: string = fs.readFileSync( listFile, 'utf-8' );
    const list = JSON.parse( listContent );
    list.userIds.push( userId );
    list.userIdMap[ userId ] = token;

    fs.writeFileSync( listFile, JSON.stringify( list, <any>'', 2 ) );
    console.log( `successfully add new user: [${ userId }], token: [${ token }]` );
}

async function getLoginToken(): Promise<string> {
    const url: string = `${ YM_HOST }/UserInterface.aspx?action=login&username=perterpon&password=51ym423904`;
    const res: Response = await getPromise( url, {} );
    const body: string = res.body;
    const [ status, token ] = body.split( '|' );
    if ( 'success' !== status ) {
        throw new Error( res.body );
    }

    console.log( 'login success!' );
    return token;
}

async function getPhoneNum(): Promise<string> {
    const url: string = `http://api.fxhyd.cn/appapi.aspx?actionid=getmobile&token=00657203fd3d20ed1d9998cf3c75aeaa2912b234&itemid=${ ETU_ITEM_ID }&province=0&city=0&isp=0&mobile=&excludeno=&_=${ Date.now() }`;
    console.log( url );
    const res: Response = await getPromise( url, {} );
    const body: string = res.body;
    const result = JSON.parse( body );
    let phone: string = '';
    try {
        phone = result.data.model;
    } catch( e ) {
        throw new Error( result );
        
    }
    console.log( `get new phone number: [${ phone }]` );
    return phone;
}

async function getSMSCode( phoneNumber: string ): Promise<string|null> {

    const url: string = `http://api.fxhyd.cn/appapi.aspx?actionid=getsms&token=00657203fd3d20ed1d9998cf3c75aeaa2912b234&itemid=20114&mobile=${ phoneNumber }&release=1&_=${ Date.now() }`;
    console.log( url );
    const res: Response = await getPromise( url, {} );
    const body: string = res.body;
    const result = JSON.parse( body );

    let smsCode = '';

    try {
        if ( 3001 === +result.error.errcode ) {
            smsCode = 'continue';
        } else if ( 0 === +result.error.errcode ) {
            const smsContent = result.data.model;
            const [ code ] = smsContent.match( /[\d]+/ );
            smsCode = code;
        } else {
            throw new Error( body );
        }
    } catch( e ) {
        throw e;
    }

    return smsCode;

}

async function start(): Promise<void> {

    while( 5 * 1000 ) {
        loginToken = await getLoginToken();
        const phoneNumber: string = await getPhoneNum();
        await sendSMSCode( phoneNumber );
        let smsCode: string = '';
        for( let i = 0; i < 12; i ++ ) {
            const res: string = await getSMSCode( phoneNumber );
            if ( 'continue' !== res ) {
                smsCode = res;
                break;
            }
            await sleep( 5 * 1000 );
        }
        if ( '' === smsCode ) {
            throw new Error( 'get sms code timeout!' );
        }
    
        await register( smsCode, `${ ethAddress }${ lastValue++ }`, phoneNumber );
        await sleep( 5 * 1000 );
    }

}

process.on( 'uncaughtException', ( error: Error ) => {
    console.log( error );
    console.log( 'restarting' );
    setTimeout( start, 5 * 1000 );
} );

process.on( 'unhandledRejection', ( reason: string ) => {
    console.log( reason );
    console.log( 'restarting...' );
    setTimeout( start , 5 * 1000 );
} );

start();
