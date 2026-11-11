import {syncOnce,accountAuth} from "../emlakcrm-auto-migrate.js";
const UID="11111111-1111-4111-8111-111111111111";
const OTHER="22222222-2222-4222-8222-222222222222";
function ok(condition,message){if(!condition)throw Error(message)}
function memory(initial={},blocked=""){
 const map=new Map(Object.entries(initial));
 return {map,
 getItem:k=>map.has(k)?map.get(k):null,
 setItem:(k,v)=>{if(k===blocked)throw Error("quota exceeded");map.set(k,v)},
 removeItem:k=>map.delete(k)};
}
function harness({payloads={},local={},remoteUser=UID,blocked=""}={}){
 const localStorage=memory(local,blocked),sessionStorage=memory({"emlakcrm_auth_session_v1":JSON.stringify({access_token:"test-access-token"})});
 const requests=[];
 const deps={localStorage,sessionStorage,scope:{currentUserId:()=>UID},
  fetch:async (url,options)=>{
   requests.push({url,options});
   if(url.endsWith("/auth/v1/user"))return {ok:true,json:async()=>({id:remoteUser})};
   const qs=new URL(url).searchParams;
   const kind=qs.get("kind")?.replace(/^eq\./,"");
   if(!qs.get("user_id")?.endsWith(UID))return {ok:false,status:403};
   const items=payloads[kind];
   return {ok:true,json:async()=>items?[{id:kind+"-v1",kind,item_count:items.length,payload:items}]:[]};
  }
 };
 return {deps,localStorage,requests,payloads};
}
Deno.test("existing cloud categories restore automatically; empty new browser is valid",async()=>{
 const h=harness({payloads:{
  clients:[{id:"c1",name:"Danışan"}],
  portfolios:[{id:"p1",title:"Konut",location:"Manisa"}],
  external_portfolios:[{url:"https://example.com/a",title:"İlan"}]
 }});
 const result=await syncOnce(h.deps);
 ok(result.status==="migrated"&&result.added===3,"all kinds migrated");
 const crm=JSON.parse(h.localStorage.getItem("emlakcrm_demo_v1__owner_"+UID));
 ok(crm.clients.length===1&&Array.isArray(crm.tasks)&&Array.isArray(crm.offices),"CRM data shape valid");
 ok(JSON.parse(h.localStorage.getItem("emlakcrm_portfoy_rapor_v1__owner_"+UID)).portfolios.length===1,"portfolio copied");
 ok(JSON.parse(h.localStorage.getItem("emlakcrm_external_portfolios_v1__owner_"+UID)).length===1,"external copied");
 const next=await syncOnce(h.deps);
 ok(next.status==="already_migrated"&&next.added===0,"never import same historical items repeatedly");
});
Deno.test("partial account moves available groups, then later missing backup without duplication",async()=>{
 const h=harness({payloads:{portfolios:[{id:"p1",title:"Emlak"}]}});
 const first=await syncOnce(h.deps);
 ok(first.status==="partial"&&first.missing.includes("clients")&&first.missing.includes("external_portfolios"),"partial recovery");
 ok(first.added===1,"portfolio moved");
 h.payloads.clients=[{id:"c1",name:"Müşteri"}];
 h.payloads.external_portfolios=[{url:"https://example.com/1"}];
 const second=await syncOnce(h.deps);
 ok(second.status==="migrated"&&second.added===2,"newly available categories moved");
 ok(JSON.parse(h.localStorage.getItem("emlakcrm_portfoy_rapor_v1__owner_"+UID)).portfolios.length===1,"original stays");
});
Deno.test("no cloud backup does not create an empty dataset or migration marker",async()=>{
 const h=harness();
 const result=await syncOnce(h.deps);
 ok(result.status==="waiting_cloud"&&result.added===0,"no backup safe");
 ok(!h.localStorage.getItem("emlakcrm_demo_v1__owner_"+UID),"no false empty customer list");
 ok(!h.localStorage.getItem("emlakcrm_auto_migration_v1__owner_"+UID),"retry remains enabled");
});
Deno.test("cross-account responses fail closed before reading another user's data",async()=>{
 const h=harness({remoteUser:OTHER,payloads:{clients:[{id:"c1",name:"No"}]}});
 let failed=false;try{await syncOnce(h.deps)}catch{failed=true}
 ok(failed,"foreign identity rejected");
 ok(!h.localStorage.getItem("emlakcrm_demo_v1__owner_"+UID),"not transferred");
});
Deno.test("existing tasks and metadata preserved; duplicate records not repeated",async()=>{
 const crm={clients:[{id:"c1",name:"A",phone:"1"}],tasks:[{id:"t1",clientId:"c1"}],offices:[{id:"o1"}],members:[]};
 const h=harness({local:{["emlakcrm_demo_v1__owner_"+UID]:JSON.stringify(crm)},payloads:{
  clients:[{id:"c1",name:"A",phone:"1"},{id:"c2",name:"B"}]
 }});
 const result=await syncOnce(h.deps);
 ok(result.status==="partial"&&result.added===1,"one new client");
 const stored=JSON.parse(h.localStorage.getItem("emlakcrm_demo_v1__owner_"+UID));
 ok(stored.clients.length===2&&stored.tasks.length===1&&stored.offices.length===1,"metadata preserved");
});
Deno.test("legacy CRM customer object lacking empty arrays is normalized without deleting records",async()=>{
 const h=harness({local:{["emlakcrm_demo_v1__owner_"+UID]:JSON.stringify({clients:[{id:"old",name:"Stored"}]})},payloads:{clients:[{id:"c2",name:"New"}]}});
 await syncOnce(h.deps);
 const stored=JSON.parse(h.localStorage.getItem("emlakcrm_demo_v1__owner_"+UID));
 ok(stored.clients.length===2&&Array.isArray(stored.tasks),"missing arrays normalized safely");
});
Deno.test("any failed local write rolls back all previously changed categories",async()=>{
 const oldClients=JSON.stringify({clients:[{id:"old",name:"Old"}],tasks:[]});
 const h=harness({blocked:"emlakcrm_portfoy_rapor_v1__owner_"+UID,
 local:{["emlakcrm_demo_v1__owner_"+UID]:oldClients},
 payloads:{
  clients:[{id:"new",name:"New"}],
  portfolios:[{id:"p1",title:"Parcel"}]
 }});
 let failed=false;try{await syncOnce(h.deps)}catch{failed=true}
 ok(failed,"failed as expected");
 ok(h.localStorage.getItem("emlakcrm_demo_v1__owner_"+UID)===oldClients,"customer original unchanged");
 ok(!h.localStorage.getItem("emlakcrm_auto_migration_v1__owner_"+UID),"no false success");
});
Deno.test("new-site module is attached to both pages and old-site upload listens to account returns",async()=>{
 const index=await Deno.readTextFile("index.html");
 const portfolio=await Deno.readTextFile("portfoy-rapor.html");
 const backup=await Deno.readTextFile("emlakcrm-cloud-backup.js");
 ok(index.includes('src="./emlakcrm-auto-migrate.js?v=20261111a"'),"new site dashboard hook");
 ok(portfolio.includes('src="./emlakcrm-auto-migrate.js?v=20261111a"'),"portfolio direct hook");
 ok(backup.includes('window.addEventListener("focus",syncOnReturn)'),"return auto backup");
 ok(backup.includes('window.addEventListener("online",syncOnReturn)'),"online auto backup");
 ok(backup.includes('!items.length'),"empty backups blocked");
});
