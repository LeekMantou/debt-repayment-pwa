(() => {
  "use strict";
  const KEY = "repayment-ledger-v1";
  const VERSION = 2;
  const $ = id => document.getElementById(id);
  const typeName = {credit:"信用卡",loan:"贷款",installment:"分期",other:"其他"};
  const els = Object.fromEntries(["todayLabel","totalBalance","monthRemaining","activeCount","selectedMonth","monthTotal","monthPaid","monthDue","dueList","debtList","scheduleDialog","scheduleIntro","scheduleList","debtDialog","debtForm","debtDialogTitle","debtName","debtType","debtBalance","debtMonthlyAmount","debtFirstDueDate","debtError","deleteDebtButton","paymentDialog","paymentForm","paymentDebtName","paymentAmount","paymentDate","paymentNote","paymentError","detailDialog","detailContent","settingsDialog","importFile","backupStatus","toast"].map(id=>[id,$(id)]));
  let state = readState();
  let editingDebtId = null;
  let selectedDebtId = null;
  let paymentDebtId = null;
  let monthCursor = todayKey().slice(0,7);
  let toastTimer;

  function todayKey(){return dateKey(new Date())}
  function dateKey(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
  function localDate(key){const [y,m,d]=key.split("-").map(Number);return new Date(y,m-1,d,12)}
  function validDate(key){if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return false;return dateKey(localDate(key))===key}
  function addMonths(key,n){const d=localDate(key), day=d.getDate(), first=new Date(d.getFullYear(),d.getMonth()+n,1,12);const last=new Date(first.getFullYear(),first.getMonth()+1,0,12).getDate();first.setDate(Math.min(day,last));return dateKey(first)}
  function cycleDate(base,n){return addMonths(base,n)}
  function shiftMonth(month,n){return dateKey(new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1+n,1,12)).slice(0,7)}
  function parseCents(value){const s=String(value).trim().replace(/,/g,"");if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;const [a,b=""]=s.split(".");const v=Number(a)*100+Number(b.padEnd(2,"0"));return Number.isSafeInteger(v)&&v>0?v:null}
  function money(v){return new Intl.NumberFormat("zh-CN",{style:"currency",currency:"CNY",minimumFractionDigits:2}).format(v/100)}
  function simpleDate(key){return new Intl.DateTimeFormat("zh-CN",{month:"long",day:"numeric"}).format(localDate(key))}
  function formatFullDate(key){return new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"long",day:"numeric"}).format(localDate(key))}
  function uid(){return crypto.randomUUID?.()||String(Date.now())+Math.random().toString(36).slice(2)}
  function defaultState(){return {version:VERSION,debts:[],payments:[],lastBackupAt:null}}
  function normalize(raw){
    if(!raw||![1,VERSION].includes(raw.version)||!Array.isArray(raw.debts)||!Array.isArray(raw.payments))throw Error("备份格式无效");
    const debts=raw.debts.map(d=>{
      const initialBalanceCents=raw.version===1?d?.balanceCents:d?.initialBalanceCents;
      const monthlyPaymentCents=raw.version===1?d?.minimumCents:d?.monthlyPaymentCents;
      const firstDueDate=raw.version===1?d?.dueDate:d?.firstDueDate;
      if(!d||typeof d.id!=="string"||typeof d.name!=="string"||!d.name.trim()||!typeName[d.type]||!Number.isSafeInteger(initialBalanceCents)||initialBalanceCents<=0||!Number.isSafeInteger(monthlyPaymentCents)||monthlyPaymentCents<=0||!validDate(firstDueDate))throw Error("负债数据无效");
      return {id:d.id,name:d.name.trim().slice(0,30),type:d.type,initialBalanceCents,monthlyPaymentCents,firstDueDate};
    });
    if(new Set(debts.map(d=>d.id)).size!==debts.length)throw Error("负债编号重复");
    const ids=new Set(debts.map(d=>d.id));
    const payments=raw.payments.map(p=>{
      if(!p||typeof p.id!=="string"||!ids.has(p.debtId)||!Number.isSafeInteger(p.amountCents)||p.amountCents<=0||!validDate(p.date)||typeof p.note!=="string")throw Error("还款数据无效");
      return {id:p.id,debtId:p.debtId,amountCents:p.amountCents,date:p.date,note:p.note.slice(0,80)};
    });
    if(new Set(payments.map(p=>p.id)).size!==payments.length)throw Error("还款编号重复");
    for(const d of debts)if(payments.filter(p=>p.debtId===d.id).reduce((a,p)=>a+p.amountCents,0)>d.initialBalanceCents)throw Error("还款总额超过欠款");
    return {version:VERSION,debts,payments,lastBackupAt:typeof raw.lastBackupAt==="string"?raw.lastBackupAt:null};
  }
  function readState(){try{const raw=localStorage.getItem(KEY);return raw?normalize(JSON.parse(raw)):defaultState()}catch{return defaultState()}}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state));return true}catch{toast("保存失败，请检查浏览器可用空间");return false}}
  function paid(d){return state.payments.filter(p=>p.debtId===d.id).reduce((a,p)=>a+p.amountCents,0)}
  function scheduledRaw(d,cutoff=todayKey()){
    let total=0;
    for(let n=0;n<1200;n++){
      if(cycleDate(d.firstDueDate,n)>=cutoff)break;
      if(total>Number.MAX_SAFE_INTEGER-d.monthlyPaymentCents)return Number.MAX_SAFE_INTEGER;
      total+=d.monthlyPaymentCents;
    }
    return total;
  }
  function assumedPaid(d){return Math.min(d.initialBalanceCents,scheduledRaw(d))}
  function balance(d){return Math.max(0,d.initialBalanceCents-Math.max(paid(d),assumedPaid(d)))}
  function paymentsFor(d){return state.payments.filter(p=>p.debtId===d.id).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))}
  function monthlyItems(month){
    const items=[], today=todayKey();
    for(const d of state.debts){
      for(let n=0;n<1200;n++){
        const due=cycleDate(d.firstDueDate,n);
        if(due.slice(0,7)>month)break;
        if(due.slice(0,7)!==month)continue;
        const priorScheduled=n>=d.initialBalanceCents/d.monthlyPaymentCents?d.initialBalanceCents:n*d.monthlyPaymentCents;
        const paidBefore=state.payments.filter(p=>p.debtId===d.id&&p.date<due).reduce((s,p)=>s+p.amountCents,0);
        const remainingBefore=Math.max(0,d.initialBalanceCents-Math.max(priorScheduled,paidBefore));
        const amount=Math.min(d.monthlyPaymentCents,remainingBefore);
        if(amount===0)continue;
        const paidToDate=state.payments.filter(p=>p.debtId===d.id&&p.date<=today).reduce((s,p)=>s+p.amountCents,0);
        const target=priorScheduled+amount;
        const recorded=paidToDate>=target;
        const status=recorded?"recorded":due<today?"assumed":"pending";
        const outstanding=status==="pending"?Math.max(0,Math.min(amount,target-paidToDate)):0;
        items.push({debt:d,due,amount,outstanding,status});
        break;
      }
    }
    return items.sort((a,b)=>a.due.localeCompare(b.due)||a.debt.name.localeCompare(b.debt.name));
  }
  function nextDue(d){
    if(balance(d)===0)return null;
    const today=todayKey();
    for(let n=0;n<1200;n++){
      const due=cycleDate(d.firstDueDate,n);
      if(due>=today&&monthlyItems(due.slice(0,7)).some(x=>x.debt.id===d.id&&x.due===due&&x.status==="pending"))return due;
    }
    return null;
  }
  function scheduleMonths(){
    const months=new Set();
    for(const d of state.debts){
      const count=Math.min(1200,Math.ceil(d.initialBalanceCents/d.monthlyPaymentCents));
      for(let n=0;n<count;n++)months.add(cycleDate(d.firstDueDate,n).slice(0,7));
    }
    return [...months].sort().map(month=>({month,items:monthlyItems(month)})).filter(entry=>entry.items.length);
  }
  function el(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n}
  function empty(target,title,description){const box=el("div","empty");box.append(el("strong","",title),el("span","",description));target.append(box)}
  function renderSchedule(){
    const page=els.scheduleDialog.querySelector(".page-inner"),scroll=page.scrollTop;
    const months=scheduleMonths(),current=todayKey().slice(0,7);
    els.scheduleIntro.textContent=months.length? `共 ${months.length} 个月 · ${months[0].month.replace("-","年")}月 — ${months.at(-1).month.replace("-","年")}月`:"添加负债后，这里会逐月列出应还金额。";
    els.scheduleList.replaceChildren();
    if(!months.length)empty(els.scheduleList,"暂无还款计划","先添加一笔负债。");
    for(const entry of months){
      const total=entry.items.reduce((sum,item)=>sum+item.amount,0);
      const outstanding=entry.items.reduce((sum,item)=>sum+item.outstanding,0);
      const details=el("details","schedule-month"+(entry.month===current?" schedule-current":""));
      if(entry.month===current)details.open=true;
      const summary=el("summary",""),title=el("span","schedule-month-title");
      title.append(el("strong","",entry.month.replace("-","年")+"月"),el("small","",entry.items.length+" 笔 · "+(outstanding?"待还 "+money(outstanding):"已还")));
      const amount=el("span","schedule-month-amount");
      amount.append(el("strong","",money(total)),el("small","","应还总额"));
      summary.append(title,amount);details.append(summary);
      const breakdown=el("div","schedule-breakdown");
      for(const item of entry.items){
        const row=el("div","schedule-breakdown-row");
        row.append(el("span","",item.debt.name+" · "+simpleDate(item.due)),el("strong","",money(item.amount)));
        breakdown.append(row);
      }
      details.append(breakdown);els.scheduleList.append(details);
    }
    page.scrollTop=scroll;
  }
  function render(){
    const now=new Date(), today=todayKey();
    els.todayLabel.textContent=new Intl.DateTimeFormat("zh-CN",{month:"long",day:"numeric"}).format(now);
    const active=state.debts.filter(d=>balance(d)>0);
    const total=active.reduce((s,d)=>s+balance(d),0);
    els.totalBalance.textContent=money(total);
    els.activeCount.textContent=active.length+" 笔";
    const currentItems=monthlyItems(today.slice(0,7));
    els.monthRemaining.textContent=money(currentItems.reduce((s,x)=>s+x.outstanding,0));
    const monthItems=monthCursor===today.slice(0,7)?currentItems:monthlyItems(monthCursor);
    const monthTotal=monthItems.reduce((s,x)=>s+x.amount,0);
    const monthDue=monthItems.reduce((s,x)=>s+x.outstanding,0);
    els.selectedMonth.textContent=monthCursor.slice(0,4)+"年"+Number(monthCursor.slice(5,7))+"月";
    els.monthTotal.textContent=money(monthTotal);
    els.monthPaid.textContent=money(monthTotal-monthDue);
    els.monthDue.textContent=money(monthDue);
    els.dueList.replaceChildren();
    if(!monthItems.length)empty(els.dueList,"本月暂无还款","切换月份查看其他还款计划。");
    for(const x of monthItems){
      const item=el("button","due-item"+(x.status==="pending"?"":" paid"));item.type="button";
      const left=el("div","due-left"),tile=el("div","date-tile"),date=localDate(x.due);
      tile.append(el("strong","",String(date.getDate())),el("small","",String(date.getMonth()+1)+"月"));
      const name=el("div","due-name");name.append(el("strong","",x.debt.name),el("small","",x.status==="recorded"?"已记录还款":x.status==="assumed"?"已还款 · 默认":x.due===today?"今天到期":simpleDate(x.due)+"到期"));
      left.append(tile,name);
      const amount=el("div","due-amount");amount.append(el("strong","",money(x.amount)),el("small","", x.status==="pending"?"待还 "+money(x.outstanding):"已还"));
      item.append(left,amount);item.addEventListener("click",()=>openDetail(x.debt.id));els.dueList.append(item);
    }
    els.debtList.replaceChildren();
    if(!state.debts.length)empty(els.debtList,"从第一笔负债开始","记录初始欠款、每月固定还款额和初次还款日。");
    for(const d of [...state.debts].sort((a,b)=>balance(b)-balance(a))){
      const card=el("button","debt-card");card.type="button";
      const top=el("div","debt-top"),title=el("div","debt-title");title.append(el("span","type-icon "+d.type,d.type==="credit"?"▤":d.type==="loan"?"⌂":d.type==="installment"?"▦":"•"),el("strong","",d.name));top.append(title,el("span","debt-chevron","›"));
      const upcoming=nextDue(d);
      const bottom=el("div","debt-bottom");bottom.append(el("span","",upcoming?"下次计划 "+simpleDate(upcoming):"暂无待还计划"),el("strong","",balance(d)===0?"已还清":typeName[d.type]));
      card.append(top,el("div","debt-balance",money(balance(d))),bottom);card.addEventListener("click",()=>openDetail(d.id));els.debtList.append(card);
    }
    els.backupStatus.textContent=state.lastBackupAt?"上次导出："+new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"long",day:"numeric"}).format(new Date(state.lastBackupAt)):"尚未导出备份";
    if(selectedDebtId&&els.detailDialog.open)renderDetail();
    if(els.scheduleDialog.open)renderSchedule();
  }
  function toast(message){clearTimeout(toastTimer);els.toast.textContent=message;els.toast.classList.add("show");toastTimer=setTimeout(()=>els.toast.classList.remove("show"),3000)}
  function openDebt(id=null){
    editingDebtId=id;const d=state.debts.find(x=>x.id===id);
    els.debtDialogTitle.textContent=d?"编辑负债":"添加负债";els.debtName.value=d?.name||"";els.debtType.value=d?.type||"credit";
    els.debtBalance.value=d?(d.initialBalanceCents/100).toFixed(2):"";els.debtMonthlyAmount.value=d?(d.monthlyPaymentCents/100).toFixed(2):"";
    els.debtFirstDueDate.value=d?.firstDueDate||todayKey();els.debtError.textContent="";els.deleteDebtButton.hidden=!d;els.debtDialog.showModal();
  }
  function openPayment(id){
    const d=state.debts.find(x=>x.id===id);if(!d||paid(d)>=d.initialBalanceCents)return;
    paymentDebtId=id;els.paymentDebtName.textContent=d.name+" · 预计剩余 "+money(balance(d));els.paymentAmount.value="";els.paymentDate.value=todayKey();els.paymentNote.value="";els.paymentError.textContent="";els.paymentDialog.showModal();
  }
  function openDetail(id){selectedDebtId=id;renderDetail();els.detailDialog.showModal()}
  function renderDetail(){
    const d=state.debts.find(x=>x.id===selectedDebtId);if(!d){els.detailDialog.close();return}
    const wrap=els.detailContent;wrap.replaceChildren();
    wrap.append(el("div","detail-heading",typeName[d.type]+" · "+(balance(d)===0?"已还清":"还款中")),el("h1","detail-title",d.name));
    const hero=el("div","detail-hero");hero.append(el("small","","预计剩余欠款"),el("strong","",money(balance(d))));
    const meta=el("div","detail-meta"),a=el("span","", "每月固定 "),b=el("span","","初次还款 ");
    a.append(el("b","",money(d.monthlyPaymentCents)));b.append(el("b","",simpleDate(d.firstDueDate)));meta.append(a,b);hero.append(meta);wrap.append(hero);
    const upcoming=nextDue(d);
    wrap.append(el("p","plan-note",upcoming?"下次计划还款："+formatFullDate(upcoming):"计划已还清"));
    if(paid(d)<d.initialBalanceCents){const payButton=el("button","primary-action","＋ 记录实际还款");payButton.type="button";payButton.addEventListener("click",()=>openPayment(d.id));wrap.append(payButton)}
    wrap.append(el("h2","detail-section-title","还款记录"));
    const list=paymentsFor(d);
    if(!list.length)empty(wrap,"还没有还款记录","还款后在这里留下记录。");
    for(const p of list){
      const row=el("div","payment-row"),info=el("div","payment-info");
      info.append(el("small","",formatFullDate(p.date)),el("span","",p.note||"还款"));
      const right=el("div","");right.append(el("strong","","−"+money(p.amountCents)));
      const del=el("button","","删除");del.type="button";del.setAttribute("aria-label","删除 "+formatFullDate(p.date)+" 的还款记录");
      del.addEventListener("click",()=>{if(!confirm("删除这笔还款记录？"))return;state.payments=state.payments.filter(x=>x.id!==p.id);save();render();toast("还款记录已删除")});
      right.append(del);row.append(info,right);wrap.append(row);
    }
  }
  function exportData(){
    const payload={...state,exportedAt:new Date().toISOString()};
    const file=new File([JSON.stringify(payload,null,2)],"还款清单-"+todayKey()+".json",{type:"application/json"});
    const fallback=()=>{const url=URL.createObjectURL(file),a=document.createElement("a");a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)};
    (async()=>{try{if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:"还款清单备份"});else fallback();state.lastBackupAt=new Date().toISOString();save();render();toast("备份已导出")}catch(e){if(e.name!=="AbortError")toast("导出失败，请重试")}})();
  }
  $("addDebtButton").addEventListener("click",()=>openDebt());
  $("floatingAdd").addEventListener("click",()=>openDebt());
  $("settingsButton").addEventListener("click",()=>els.settingsDialog.showModal());
  $("viewScheduleButton").addEventListener("click",()=>{
    renderSchedule();
    els.scheduleDialog.showModal();
    const current=els.scheduleList.querySelector(".schedule-current");
    if(current)els.scheduleDialog.querySelector(".page-inner").scrollTop=current.offsetTop-els.scheduleList.offsetTop;
  });
  $("previousMonth").addEventListener("click",()=>{monthCursor=shiftMonth(monthCursor,-1);render()});
  $("nextMonth").addEventListener("click",()=>{monthCursor=shiftMonth(monthCursor,1);render()});
  $("editDebtButton").addEventListener("click",()=>openDebt(selectedDebtId));
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
  els.debtForm.addEventListener("submit",e=>{
    e.preventDefault();const name=els.debtName.value.trim(),amount=parseCents(els.debtBalance.value),monthlyAmount=parseCents(els.debtMonthlyAmount.value),date=els.debtFirstDueDate.value;
    if(!name||!amount||!monthlyAmount||!validDate(date)){els.debtError.textContent="请填写名称、有效金额和初次还款日";return}
    if(editingDebtId){
      const d=state.debts.find(x=>x.id===editingDebtId);if(!d)return;
      if(amount<paid(d)){els.debtError.textContent="初始欠款不能低于已记录的还款总额";return}
      Object.assign(d,{name,type:els.debtType.value,initialBalanceCents:amount,monthlyPaymentCents:monthlyAmount,firstDueDate:date});
    }else state.debts.push({id:uid(),name,type:els.debtType.value,initialBalanceCents:amount,monthlyPaymentCents:monthlyAmount,firstDueDate:date});
    save();els.debtDialog.close();render();toast(editingDebtId?"负债已更新":"负债已添加");
  });
  els.deleteDebtButton.addEventListener("click",()=>{
    if(!editingDebtId||!confirm("删除这笔负债及其全部还款记录？"))return;
    state.debts=state.debts.filter(d=>d.id!==editingDebtId);state.payments=state.payments.filter(p=>p.debtId!==editingDebtId);
    save();els.debtDialog.close();if(els.detailDialog.open)els.detailDialog.close();selectedDebtId=null;render();toast("负债已删除");
  });
  els.paymentForm.addEventListener("submit",e=>{
    e.preventDefault();const d=state.debts.find(x=>x.id===paymentDebtId),amount=parseCents(els.paymentAmount.value),date=els.paymentDate.value;
    if(!d||!amount||!validDate(date)){els.paymentError.textContent="请输入有效金额和日期";return}
    if(date>todayKey()){els.paymentError.textContent="还款日期不能晚于今天";return}
    if(amount>d.initialBalanceCents-paid(d)){els.paymentError.textContent="还款金额不能超过尚未手动记录的欠款";return}
    state.payments.push({id:uid(),debtId:d.id,amountCents:amount,date,note:els.paymentNote.value.trim()});
    save();els.paymentDialog.close();render();toast("还款已记录");
  });
  $("exportButton").addEventListener("click",exportData);
  $("importButton").addEventListener("click",()=>els.importFile.click());
  els.importFile.addEventListener("change",async()=>{
    const file=els.importFile.files?.[0];els.importFile.value="";if(!file)return;
    try{const raw=JSON.parse(await file.text()),restored=normalize(raw);if(!confirm("恢复备份将替换当前全部负债和还款记录，继续吗？"))return;state=restored;save();els.settingsDialog.close();if(els.detailDialog.open)els.detailDialog.close();selectedDebtId=null;render();toast("备份已恢复")}catch(e){toast(e.message||"备份文件无效")}
  });
  $("demoButton").addEventListener("click",()=>{
    if(state.debts.length){toast("请先清空账本，再载入示例");return}
    const d1=addMonths(todayKey(),0),d2=addMonths(todayKey(),1);
    state.debts=[{id:uid(),name:"示例 · 信用卡",type:"credit",initialBalanceCents:1286000,monthlyPaymentCents:120000,firstDueDate:d1},{id:uid(),name:"示例 · 数码分期",type:"installment",initialBalanceCents:480000,monthlyPaymentCents:80000,firstDueDate:d2}];state.payments=[];save();els.settingsDialog.close();render();toast("已载入示例数据");
  });
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)render()});
  if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
  render();
})();
