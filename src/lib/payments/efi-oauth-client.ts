import {resolveEfiRuntimeConfig,type EfiAuthRuntimeConfig} from "./efi-config.ts";
import {EfiMtlsHttpClient,type EfiHttpTransport} from "./efi-http-client.ts";

export type EfiAccessToken={accessToken:string;tokenType:string;expiresIn:number;scope:string};
export class EfiOAuthClient{
 constructor(private readonly config:EfiAuthRuntimeConfig,private readonly http:EfiHttpTransport=new EfiMtlsHttpClient(config)){}
 async getAccessToken():Promise<EfiAccessToken>{try{
  const response=await this.http.request({path:"/oauth/token",method:"POST",headers:{"content-type":"application/json",authorization:`Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}`},body:JSON.stringify({grant_type:"client_credentials"})});
  if(response.status<200||response.status>=300)throw new Error("EFI_AUTH_FAILED");
  const parsed:unknown=JSON.parse(response.body);if(!isTokenResponse(parsed))throw new Error("EFI_AUTH_FAILED");
  return{accessToken:parsed.access_token,tokenType:parsed.token_type,expiresIn:parsed.expires_in,scope:parsed.scope};
 }catch(error){if(error instanceof Error&&/^EFI_/.test(error.message))throw error;throw new Error("EFI_AUTH_FAILED")}}
}
export function getEfiAccessToken(options:{env?:NodeJS.ProcessEnv;http?:EfiHttpTransport}={}){const config=resolveEfiRuntimeConfig(options.env);return new EfiOAuthClient(config,options.http).getAccessToken()}
function isTokenResponse(value:unknown):value is {access_token:string;token_type:string;expires_in:number;scope:string}{if(!value||typeof value!=="object")return false;const token=value as Record<string,unknown>;return typeof token.access_token==="string"&&Boolean(token.access_token)&&typeof token.token_type==="string"&&typeof token.expires_in==="number"&&Number.isFinite(token.expires_in)&&typeof token.scope==="string"}
