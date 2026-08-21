import https from "node:https";
import type { EfiAuthRuntimeConfig } from "./efi-config.ts";

export type EfiHttpRequest={path:"/oauth/token";method:"POST";headers:Record<string,string>;body:string};
export type EfiHttpResponse={status:number;body:string};
export interface EfiHttpTransport{request(request:EfiHttpRequest):Promise<EfiHttpResponse>}

/** Fixed-origin, TLS-verified mTLS transport. The P12 stays only in an in-memory Buffer. */
export class EfiMtlsHttpClient implements EfiHttpTransport{
 constructor(private readonly config:EfiAuthRuntimeConfig,private readonly timeoutMs=10_000){}
 request(request:EfiHttpRequest):Promise<EfiHttpResponse>{return new Promise((resolve,reject)=>{
  const nativeRequest=https.request(`${this.config.baseUrl}${request.path}`,{method:request.method,headers:request.headers,pfx:this.config.certificateP12,rejectUnauthorized:true,timeout:this.timeoutMs},response=>{
   const chunks:Buffer[]=[];response.on("data",chunk=>chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)));response.on("end",()=>resolve({status:response.statusCode??0,body:Buffer.concat(chunks).toString("utf8")}));
  });
  nativeRequest.once("timeout",()=>nativeRequest.destroy(new Error("EFI_TIMEOUT")));
  nativeRequest.once("error",error=>reject(error.message==="EFI_TIMEOUT"?error:new Error("EFI_AUTH_FAILED")));
  nativeRequest.end(request.body);
 })}
}
