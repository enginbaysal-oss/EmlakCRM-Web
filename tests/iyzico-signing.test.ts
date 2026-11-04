import {signedHeaders} from "../supabase/functions/_shared/iyzico.ts";
Deno.test("iyzico IYZWSv2 authorization follows published HMAC formula",async()=>{
 const headers=await signedHeaders("/payment/bin/check",'{"binNumber":"589004"}',"test-api-key","test-secret-key","123456789");
 const expected="YXBpS2V5OnRlc3QtYXBpLWtleSZyYW5kb21LZXk6MTIzNDU2Nzg5JnNpZ25hdHVyZTowMTE4NTI3M2ZhZTQ5OTI2MDE2YWNlYjNhMGY4Y2VlOGQxYWVlMmVmY2FkZTZhMTI5ZGJkZWE4NGNmYmQwNGRj";
 if(headers.authorization!=="IYZWSv2 "+expected)throw Error("signature_mismatch");
 if(headers["x-iyzi-rnd"]!=="123456789")throw Error("nonce_mismatch");
});
Deno.test("invalid paths and missing keys fail closed",async()=>{
 for(const [path,key,secret] of [["bad","a","b"],["/payment/abc?token=secret","a","b"],["/payment/bin/check","","secret"]]){
  let rejected=false;
  try{await signedHeaders(path,"{}",key,secret,"123")}catch{rejected=true}
  if(!rejected)throw Error("invalid_input_accepted");
 }
});
