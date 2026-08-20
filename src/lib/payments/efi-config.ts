export type EfiRuntimeConfig={environment:"sandbox"|"production";providerEnvironment:"SANDBOX"|"PRODUCTION";clientId:string;clientSecret:string;pixKey:string;certificate:string;payeeCode:string|null};

/** Efí remains opt-in and fail-closed until credentials and certification are approved. */
export function resolveEfiRuntimeConfig(env:NodeJS.ProcessEnv=process.env):EfiRuntimeConfig{
  if(String(env.EFI_ENABLED??"").trim().toLowerCase()!=="true")throw new Error("EFI_DISABLED");
  const environment=String(env.EFI_ENVIRONMENT??"").trim().toLowerCase();
  if(environment!=="sandbox"&&environment!=="production")throw new Error("EFI_ENVIRONMENT_NOT_CONFIGURED");
  if(environment==="production")throw new Error("EFI_PRODUCTION_DISABLED");
  const clientId=env.EFI_CLIENT_ID??"";if(!clientId)throw new Error("EFI_CLIENT_ID_MISSING");
  const clientSecret=env.EFI_CLIENT_SECRET??"";if(!clientSecret)throw new Error("EFI_CLIENT_SECRET_MISSING");
  const pixKey=env.EFI_PIX_KEY??"";if(!pixKey)throw new Error("EFI_PIX_KEY_MISSING");
  const certificate=env.EFI_CERTIFICATE??"";if(!certificate)throw new Error("EFI_CERTIFICATE_MISSING");
  return{environment,providerEnvironment:"SANDBOX",clientId,clientSecret,pixKey,certificate,payeeCode:env.EFI_PAYEE_CODE??null};
}
export function isEfiConfigured(env:NodeJS.ProcessEnv=process.env){try{resolveEfiRuntimeConfig(env);return true}catch{return false}}
