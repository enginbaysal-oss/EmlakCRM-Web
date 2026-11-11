/* EmlakCRM: date/time recovery point planning and safe, non-destructive merging. */
export const KINDS=["clients","portfolios","external_portfolios"];
const normal=s=>String(s??"").trim().toLocaleLowerCase("tr-TR");
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const validDate=x=>typeof x==="string"&&Number.isFinite(Date.parse(x));
const validID=x=>x!==undefined&&x!==null&&String(x).trim().length>0;
export function buildRestorePoints(rows){
 if(!Array.isArray(rows))throw Error("Yedek geçmişi okunamadı.");
 const filtered=rows.filter(row=>row&&KINDS.includes(row.kind)&&validDate(row.created_at)&&typeof row.id==="string"&&
    Number.isSafeInteger(row.item_count)&&row.item_count>=0);
 filtered.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
 const seen=new Set(),points=[];
 for(const row of filtered){
  const cutoff=Date.parse(row.created_at);
  const minute=Math.floor(cutoff/60000);
  if(seen.has(minute))continue;
  seen.add(minute);
  const snapshots={};
  for(const kind of KINDS){
   // Each kind uses its own most recent snapshot not later than the selected time.
   const latest=filtered.find(v=>v.kind===kind&&Date.parse(v.created_at)<=cutoff);
   if(!latest)continue;
   snapshots[kind]=latest;
  }
  if(Object.keys(snapshots).length===0)continue;
  points.push({
   date:row.created_at,
   minute,
   snapshots,
   counts:KINDS.map(kind=>(snapshots[kind]?.item_count??0))
  });
 }
 return points;
}
export function validateBackupRow(row,version){
 if(!row||row.id!==version.id||row.kind!==version.kind||!Array.isArray(row.payload)||
    !Number.isSafeInteger(row.item_count)||row.item_count!==row.payload.length)
  throw Error("Yedek sürümü doğrulanamadı: "+version.kind);
 if(row.payload.length>(row.kind==="external_portfolios"?1000:20000)||
    row.payload.some(x=>!obj(x)))throw Error("Yedekte geçersiz kayıt var: "+version.kind);
 if(row.kind!=="external_portfolios"&&row.payload.some(x=>!validID(x.id)))
  throw Error("Yedekte kimliksiz kayıt var: "+version.kind);
 if(row.kind==="external_portfolios"&&row.payload.some(x=>!normal(x.url)&&!normal(x.title)))
  throw Error("Yedekte geçersiz çekilen ilan var.");
 return row.payload;
}
function mergeById(local,incoming,kind){
 const result=local.slice(),ids=new Map(),added=[],duplicates=[];
 for(const v of result)if(obj(v)&&validID(v.id))ids.set(String(v.id),v);
 for(const v of incoming){
  const id=String(v.id);
  const existing=ids.get(id);
  if(existing){
   if(kind==="clients"&&normal(existing.name)!==normal(v.name)&&
      (!normal(existing.phone)||!normal(v.phone)||normal(existing.phone)!==normal(v.phone)))
    throw Error("Aynı kimliğe sahip farklı müşteriler bulundu; yükleme durduruldu.");
   duplicates.push(v);continue;
  }
  if(kind==="clients"&&result.some(x=>obj(x)&&normal(x.phone)&&normal(v.phone)&&
     normal(x.phone)===normal(v.phone)&&normal(x.name)===normal(v.name))){duplicates.push(v);continue}
  if(kind==="portfolios"&&result.some(x=>obj(x)&&
     ((normal(x.listingUrl)&&normal(x.listingUrl)===normal(v.listingUrl))||
      (normal(x.title)&&normal(x.title)===normal(v.title)&&normal(x.location)===normal(v.location))))){
   duplicates.push(v);continue;
  }
  ids.set(id,v);result.push(v);added.push(v);
 }
 return {data:result,added:added.length,duplicates:duplicates.length};
}
function mergeExternal(local,incoming){
 const result=local.slice(),keys=new Set(result.filter(obj).map(x=>String(x.url||"")+"|"+String(x.title||"")));
 let added=0,duplicates=0;
 for(const v of incoming){
  const id=String(v.url||"")+"|"+String(v.title||"");
  if(keys.has(id)){duplicates++;continue}
  result.push(v);keys.add(id);added++;
 }
 if(result.length>1000)throw Error("Çekilen portföylerde 1000 kayıt sınırı aşılıyor.");
 return {data:result,added,duplicates};
}
export function mergeAll(local,backups){
 if(!obj(local)||!obj(backups))throw Error("Eksik geri yükleme bilgisi.");
 const crm=local.clients===null?{clients:[],tasks:[],offices:[],members:[]}:local.clients;
 const portfolio=local.portfolios===null?{portfolios:[],advisor:{},drafts:{},siteCatalog:[]}:local.portfolios;
 const external=local.external_portfolios===null?[]:local.external_portfolios;
 if(!obj(crm)||!Array.isArray(crm.clients)||!Array.isArray(crm.tasks)||
    !obj(portfolio)||!Array.isArray(portfolio.portfolios)||!Array.isArray(external))
  throw Error("Mevcut cihaz kayıtları okunamadı. Üzerine yazma yapılmayacak.");
 const c=Array.isArray(backups.clients)?mergeById(crm.clients,backups.clients,"clients"):{data:crm.clients,added:0,duplicates:0};
 const p=Array.isArray(backups.portfolios)?mergeById(portfolio.portfolios,backups.portfolios,"portfolios"):{data:portfolio.portfolios,added:0,duplicates:0};
 const e=Array.isArray(backups.external_portfolios)?mergeExternal(external,backups.external_portfolios):{data:external,added:0,duplicates:0};
 return {
  updated:{
   clients:{...crm,clients:c.data},
   portfolios:{...portfolio,portfolios:p.data},
   external_portfolios:e.data
  },
  stats:{clients:c,portfolios:p,external_portfolios:e},
  added:c.added+p.added+e.added
 };
}
