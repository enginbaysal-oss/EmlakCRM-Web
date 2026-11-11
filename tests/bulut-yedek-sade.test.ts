import {buildRestorePoints,validateBackupRow,mergeAll,KINDS} from "../bulut-yedek-core.js";
function ok(value:unknown,message:string): asserts value {if(!value)throw Error(message)}
const ver=(id:string,kind:string,created_at:string,item_count:number)=>({id,kind,created_at,item_count});
Deno.test("date-time choice uses latest EACH kind as-of selected date, never a later backup",()=>{
 const rows=[
  ver("c1","clients","2026-11-10T20:00:00Z",2),
  ver("p0","portfolios","2026-11-10T21:00:00Z",11),
  ver("e0","external_portfolios","2026-11-10T22:00:00Z",150),
  ver("p1","portfolios","2026-11-10T23:00:00Z",14),
  ver("e1","external_portfolios","2026-11-11T08:00:00Z",151)
 ];
 const list=buildRestorePoints(rows);
 ok(list.length>=3,"enough complete historical points");
 ok(list[0].counts.join(",")==="2,14,151","newest combined counts");
 const past=list.find(p=>p.date==="2026-11-10T23:00:00Z");
 ok(past&&past.counts.join(",")==="2,14,150","historical external version");
 ok((past?.snapshots as Record<string,{id:string}>|undefined)?.external_portfolios?.id==="e0","never borrow future content");
});
Deno.test("missing any category disables restore",()=>{
 ok(buildRestorePoints([ver("c1","clients","2026-11-11T11:00:00Z",2)]).length===0,"all three required");
});
Deno.test("validates complete own backup and guards malformed or idless data",()=>{
 const base={id:"1",kind:"clients",item_count:2,payload:[{id:"a",name:"A"},{id:"b",name:"B"}]};
 ok(validateBackupRow(base,base).length===2,"valid backup");
 for(const row of [
  {...base,payload:[{id:"a",name:"A"}]},
  {...base,payload:[{id:"a",name:"A"},{name:"B"}]},
  {...base,kind:"portfolios"},
  {...base,payload:[{id:"a"},null]}
 ]){
  let blocked=false;try{validateBackupRow(row,base)}catch{blocked=true}
  ok(blocked,"reject corrupt data");
 }
 const e={id:"x",kind:"external_portfolios",item_count:2,payload:[{title:"Title"},{url:"https://example.test/123"}]};
 ok(validateBackupRow(e,e).length===2,"idless external titles/URLs remain supported");
});
Deno.test("whole-restore merges safely, preserves tasks/office/advisor metadata and does not mutate source",()=>{
 const local={
  clients:{clients:[{id:"a",name:"A",phone:"1"}],tasks:[{id:"task",clientId:"a"}],offices:[{id:22}],members:[{id:2}]},
  portfolios:{portfolios:[{id:"p0",title:"Home",location:"X"}],advisor:{name:"Agent"},drafts:{a:3}},
  external_portfolios:[{url:"https://x",title:"Ad"}]
 };
 const before=JSON.stringify(local);
 const backups={
  clients:[{id:"a",name:"A",phone:"1"},{id:"b",name:"B",phone:"2"}],
  portfolios:[{id:"p0",title:"Home",location:"X"},{id:"p1",title:"New",location:"Y"}],
  external_portfolios:[{url:"https://x",title:"Ad"},{url:"https://y",title:"New"}]
 };
 const result=mergeAll(local,backups);
 ok(result.added===3,"three added");
 ok(result.updated.clients.tasks.length===1&&result.updated.clients.offices.length===1,"CRM metadata");
 ok(result.updated.portfolios.advisor.name==="Agent"&&result.updated.portfolios.drafts.a===3,"portfolio metadata");
 ok(result.updated.external_portfolios.length===2,"external additions");
 ok(JSON.stringify(local)===before,"inputs never modified");
});
Deno.test("new browser restores with complete default CRM and portfolio shape",()=>{
 const result=mergeAll({clients:null,portfolios:null,external_portfolios:null},{
  clients:[{id:"a",name:"X"}],portfolios:[{id:"b",title:"Y"}],external_portfolios:[{url:"https://example.test"}]
 });
 ok(result.updated.clients.tasks.length===0&&Array.isArray(result.updated.clients.offices),"valid CRM shape");
 ok(Array.isArray(result.updated.portfolios.portfolios)&&typeof result.updated.portfolios.drafts==="object","portfolio shape");
 ok(result.added===3,"restored all three");
});
Deno.test("identity collision, malformed local records and >1000 externals fail closed",()=>{
 let blocked=false;
 try{mergeAll({clients:{clients:[{id:"a",name:"Ali",phone:"11"}],tasks:[]},portfolios:null,external_portfolios:null},{
  clients:[{id:"a",name:"Veli",phone:"22"}],portfolios:[],external_portfolios:[]
 })}catch{blocked=true}
 ok(blocked,"identity collision rejected");
 blocked=false;
 try{mergeAll({clients:{clients:[]},portfolios:null,external_portfolios:null},{
  clients:[],portfolios:[],external_portfolios:[]
 })}catch{blocked=true}
 ok(blocked,"malformed CRM rejected");
 blocked=false;
 try{mergeAll({clients:null,portfolios:null,external_portfolios:null},{
  clients:[],portfolios:[],external_portfolios:Array.from({length:1001},(_,i)=>({url:"https://x/"+i}))
 })}catch{blocked=true}
 ok(blocked,"safety limit enforced");
});
Deno.test("account page retains one cloud backup button and backup pipeline is unchanged",async()=>{
 const index=await Deno.readTextFile("index.html");
 const page=await Deno.readTextFile("bulut-yedek.html");
 const backup=await Deno.readTextFile("emlakcrm-cloud-backup.js");
 ok(index.includes('id="crmCloudBackupNow"')&&index.includes('bulut-yedek.html?v=20261111sade1'),"buttons");
 ok(index.includes('<details')&&index.includes('id="crmFullExport"'),"advanced file backup retained");
 ok(page.includes('id="date"')&&page.includes('id="restore"'),"date only interface");
 ok(!page.includes('id="previewRows"')&&!page.includes('id="confirmLocal"'),"no per-record complexity");
 ok(backup.includes('const TYPES={clients:')&&backup.includes('window.EmlakCRMCloudBackup={run:manualRun}'),"original cloud backup untouched");
 ok(KINDS.join(",")==="clients,portfolios,external_portfolios","only actual supported kinds");
});
