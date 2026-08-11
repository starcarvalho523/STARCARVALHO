
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SESSION_ID="bb2c7ec5-f306-4042-8e60-603bea94c76e";

export default function ReconciliarCheckoutPage(){
  const router=useRouter();
  const started=useRef(false);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState<string|null>(null);

  async function reconcile(){
    if(started.current)return;
    started.current=true;
    setLoading(true);
    setError(null);
    try{
      const response=await fetch("/api/payments/credit-checkout/reconcile",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sessionId:SESSION_ID})});
      if(!response.ok)throw new Error("RECONCILIATION_FAILED");
      router.replace(`/frentista/saidas?session=${SESSION_ID}`);
      router.refresh();
    }catch{
      setError("NÃ£o foi possÃ­vel reconciliar o pagamento. Nenhuma nova tentativa foi realizada.");
      setLoading(false);
    }
  }

  return <main style={{maxWidth:640,margin:"48px auto",padding:24}}>
    <h1>ReconciliaÃ§Ã£o controlada</h1>
    <p>SessÃ£o PKH3C92 Â· R$ 50,00 Â· dois eventos reais armazenados.</p>
    <button type="button" onClick={reconcile} disabled={loading} aria-busy={loading} style={{padding:"12px 18px",fontWeight:700}}>
      {loading?"Reprocessandoâ€¦":"Reprocessar eventos reais"}
    </button>
    {error?<p role="alert" style={{color:"#b91c1c"}}>{error}</p>:null}
  </main>;
}