const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("dist/app.js", "utf8");
const cutoff = source.indexOf('  $("addDebtButton").addEventListener');
assert.ok(cutoff > 0);
const code = source.slice(0, cutoff) + "globalThis.core={todayKey,addMonths,monthlyItems,scheduleMonths,balance,paid,scheduledRaw,normalize,setState:s=>state=s};})();";
const context = {
  document: {getElementById: () => ({})},
  localStorage: {getItem: () => null},
  Intl, Date, Number, String, Math, JSON, Map, Set, Error,
};
vm.createContext(context);
vm.runInContext(code, context);
const core = context.core;
const today = core.todayKey();
const thisMonth = today.slice(0, 7);
const dueYesterday = new Date();
dueYesterday.setDate(dueYesterday.getDate() - 1);
const dueTomorrow = new Date();
dueTomorrow.setDate(dueTomorrow.getDate() + 1);
const key = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
const first = {id:"a",name:"甲",type:"credit",initialBalanceCents:100000,monthlyPaymentCents:20000,firstDueDate:key(dueYesterday)};
const second = {id:"b",name:"乙",type:"loan",initialBalanceCents:200000,monthlyPaymentCents:30000,firstDueDate:key(dueTomorrow)};
core.setState({version:2,debts:[first,second],payments:[],lastBackupAt:null});
let rows = core.monthlyItems(thisMonth);
assert.equal(rows.reduce((sum,row)=>sum+row.amount,0),50000,"两笔负债的当月计划应合计");
assert.equal(rows.find(row=>row.debt.id==="a").status,"assumed","过期默认已还");
assert.equal(rows.find(row=>row.debt.id==="b").status,"pending","未来日期仍待还");
assert.equal(core.balance(first),80000,"过期计划只扣一次");
assert.equal(core.scheduleMonths().find(entry=>entry.month===thisMonth).items.reduce((sum,row)=>sum+row.amount,0),50000,"逐月列表合计同月多笔负债");
core.setState({version:2,debts:[first,second],payments:[{id:"p",debtId:"a",amountCents:20000,date:today,note:""}],lastBackupAt:null});
assert.equal(core.balance(first),80000,"手动记录不重复扣款");
assert.equal(core.monthlyItems(thisMonth).find(row=>row.debt.id==="a").status,"recorded");
core.setState({version:2,debts:[first,second],payments:[{id:"p",debtId:"a",amountCents:25000,date:today,note:""}],lastBackupAt:null});
assert.equal(core.balance(first),75000,"超出默认金额的实际还款继续减少余额");
const fixed = {id:"c",name:"丙",type:"loan",initialBalanceCents:75000,monthlyPaymentCents:30000,firstDueDate:"2027-01-31"};
core.setState({version:2,debts:[fixed],payments:[],lastBackupAt:null});
assert.equal(core.monthlyItems("2027-01")[0].amount,30000,"首期固定金额");
assert.equal(core.monthlyItems("2027-02")[0].amount,30000,"次月固定金额");
assert.equal(core.monthlyItems("2027-02")[0].due,"2027-02-28","31 日遇短月落在月末");
assert.equal(core.monthlyItems("2027-03")[0].amount,15000,"最后一期按剩余欠款收尾");
assert.equal(core.monthlyItems("2027-04").length,0,"还清后不再生成计划");
assert.deepEqual(Array.from(core.scheduleMonths(),entry=>entry.month),["2027-01","2027-02","2027-03"],"逐月列表只显示有应还金额的月份");
const migrated=core.normalize({version:1,debts:[{id:"old",name:"旧记录",type:"loan",balanceCents:100000,minimumCents:20000,dueDate:"2027-01-31"}],payments:[],lastBackupAt:null});
assert.equal(migrated.version,2);
assert.equal(migrated.debts[0].firstDueDate,"2027-01-31","旧数据日期保留为初次还款日");
console.log("schedule tests passed");
