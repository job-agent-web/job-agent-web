"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = new TextDecoder('windows-1252').decode(fs.readFileSync(path.join(root, 'app.js')));
const storage = new Map();
const context = {
  console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
  document: {getElementById: () => null},
  localStorage: {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key)},
  location: {protocol:'http:', origin:'http://localhost:8189', href:'http://localhost:8189/app.html'}
};
context.window = context;
vm.createContext(context);
// Load the actual declarations while leaving browser startup to the browser tests.
try { vm.runInContext(source.replace('el.profile1.value=defaultProfile1;', 'throw new Error("WORKFLOW_DECLARATIONS_READY");'), context); }
catch(error) { if (error.message !== 'WORKFLOW_DECLARATIONS_READY') throw error; }
function node(value = '') {
  const attributes = new Map();
  return {value, disabled:false, hidden:false, style:{}, setAttribute:(k,v)=>attributes.set(k,v), getAttribute:k=>attributes.get(k)||null, removeAttribute:k=>attributes.delete(k), focus(){}};
}
const cv = 'Alex Audit\nProfessional Experience\nData Analyst | Example Analytics\nApril 2022 - Present\n- Validated source data with SQL and documented discrepancies for the reporting team.\n- Built Excel reports and Power BI dashboards to explain operational performance.\n- Partnered with managers to clarify reporting requirements and resolve data quality issues.';
async function run() {
  assert.deepEqual(Array.from(context.atsWords('Data Analyst Excel Power BI SQL Validate')), ['data','analyst','excel','power','sql','validate']);
  assert.equal(context.clampScore(0), 0);
  assert.equal(context.normalizeCvScoreResult({score:0,verdict:'No match'}, {cvText:cv,jobTitle:'Data Analyst'}).score, 0);
  const planFunctions={getCurrentHostedUser:context.getCurrentHostedUser,getCurrentHostedUserRole:context.getCurrentHostedUserRole,currentDaysState:context.currentDaysState,getCurrentUserPlanType:context.getCurrentUserPlanType};
  context.getCurrentHostedUser=()=>({email:'alex@example.com'});context.getCurrentHostedUserRole=()=> 'user';
  context.currentDaysState=()=>({expired:false,days:31});context.getCurrentUserPlanType=()=> 'monthly';
  assert.equal(context.hasSixMonthPlusAccess(),false,'A monthly account with a bonus day must remain restricted');
  context.currentDaysState=()=>({expired:false,days:1});context.getCurrentUserPlanType=()=> 'six month';
  assert.equal(context.hasSixMonthPlusAccess(),true,'A six-month account keeps its entitlements until expiry');
  Object.assign(context,planFunctions);
  assert.equal(context.limitPaymentReference('Very long name '.repeat(10), 'Very long name '.repeat(10), 'alex@example.com'), 'alex@example.com');
  context.getCurrentHostedUser=()=>({name:'Name '.repeat(30),email:'alex@example.com'});
  for(const [name,amount] of [['buildMonthlyRevolutUrl','1000'],['buildSixMonthRevolutUrl','5000'],['buildYearlyRevolutUrl','10000'],['buildLifetimeRevolutUrl','20000']]){
    const url=new URL(context[name]());assert.equal(url.searchParams.get('amount'),amount);assert.equal(url.searchParams.get('note'),'alex@example.com');
  }
  const formatted = context.stripCoverLetterDateText('Dear Hiring Manager,\n\nExample April 2022 - Present\n\nYours faithfully\nAlex Audit');
  assert.match(formatted, /Manager,\n\n/); assert.doesNotMatch(formatted, /2022/);
  assert.equal(context.cleanFallbackEvidenceText('\uFFFD Built accurate dashboards. , with clear controls.'), 'Built accurate dashboards. with clear controls.');
  const paragraph = context.buildFallbackStarParagraph({title:'Data Analyst'}, {role:'Data Analyst',text:'\u2022 Validated SQL reports and resolved discrepancies.'},0,'data','accurate reporting');
  assert.doesNotMatch(paragraph, /\uFFFD|\.\s*,|I [A-Z]alidated/); assert.match(paragraph,/validated SQL reports/);
  const job={title:'Data Analyst',company:'Example Employer',raw:'Data analysis and stakeholder reporting',profileText:cv,profileRawText:cv,letterVariant:0};
  const firstDraft=context.buildFallbackCoverLetter(job,'civil');job.letterVariant=1;
  const secondDraft=context.buildFallbackCoverLetter(job,'civil');assert.notEqual(firstDraft,secondDraft);
  assert.doesNotMatch(secondDraft,/2022|\uFFFD/);assert.match(secondDraft,/Yours faithfully/);
  const preview=context.normalizeGeneratedCoverLetter(secondDraft,job,'civil');
  assert.ok(context.countTextWords(preview)>=750&&context.countTextWords(preview)<=950,'Complete display normalization must retain the letter body: '+context.countTextWords(preview));
  assert.doesNotMatch(preview,/\.{2,}(?=\s|$)/);
  const roleOnly=context.buildFallbackCoverLetter({title:'Data Analyst',company:'Example Employer',raw:'Analyse data and report findings',profileText:'',profileRawText:''},'civil');
  assert.doesNotMatch(roleOnly,/My CV|my previous roles|I delivered|I have developed evidence/i);
  const roleOnlyWords=context.countTextWords(roleOnly);assert.ok(roleOnlyWords>=750&&roleOnlyWords<=950,'Role-only draft length: '+roleOnlyWords);
  context.el.profile1 = node(''); context.el.profile2 = node('');
  context.getStoredCvSlotText = () => 'OLD CV CONTENT';
  context.el.profile1.setAttribute('data-upload-state','reading');
  assert.equal(context.getUploadedCvSlotText(1), '');
  context.el.profile1.setAttribute('data-upload-state','failed');
  assert.equal(context.getUploadedCvSlotText(1), '');
  context.el.profile1.setAttribute('data-upload-state','ready'); context.el.profile1.value = cv;
  assert.equal(context.getUploadedCvSlotText(1), cv);
  context.el.coverLetterUseUploaded={checked:true};context.el.coverLetterUseGenerated={checked:false};context.el.activeCv1={checked:true};
  context.persistStoredCvs();assert.equal(JSON.parse(storage.get('jobMatchAgentCvSlots')).sourceType,'uploaded');
  context.el.coverLetterUseUploaded.checked=false;context.restoreStoredCvs();assert.equal(context.el.coverLetterUseUploaded.checked,true);
  let first, second;
  context.readRexAttachment = file => new Promise(resolve => {if(file.name==='first.docx')first=resolve;else second=resolve;});
  for(const name of ['setProfileFileLabel','setProfileStatus','persistStoredCvs','refreshCoverLetterReadiness','setCoverLetterCvSourceStatus']) context[name]=()=>{};
  context.updateProfileDetectionStatus = target => target.setAttribute('data-upload-state','ready');
  const a = context.loadProfileFile({name:'first.docx',size:100},context.el.profile1);
  const b = context.loadProfileFile({name:'second.docx',size:100},context.el.profile1);
  second('New selected CV'); await b; first('Old delayed CV'); await a;
  assert.equal(context.el.profile1.value, 'New selected CV');
  context.canOpenPremiumPane=()=>true; context.isHostedHttpMode=()=>true; context.hasDesktopAiBridge=()=>false;
  for(const name of ['renderRexChatMessages','setRexChatStatus','setRexChatFileStatus'])context[name]=()=>{};
  context.el.rexChatInput=node('Help me prepare'); context.el.sendRexChatBtn=node();
  let reply; context.callHostedRexChat=()=>new Promise(resolve=>reply=resolve);
  context.rexChatMessages=[]; context.rexChatSending=false;
  const pending=context.sendRexChatMessage();
  assert.equal(context.rexChatSending,true);
  context.clearRexChatMessages(); reply({ok:true,text:'Stale response',source:'mock'}); await pending;
  assert.equal(context.rexChatMessages.length,0); assert.equal(context.el.rexChatInput.disabled,false);
  let runs=0, finish;
  context.performMatchRequest=()=>{runs++;return new Promise(resolve=>finish=resolve);};
  const primary=context.performMatch(); await context.performMatch(); assert.equal(runs,1); finish(true); assert.equal(await primary,true);
  context.fetch=async()=>({status:403,json:async()=>({ok:false,message:'Pane locked'})});
  context.getCoverLetterAiModel=()=> 'test';context.buildCoverLetterAvoidanceText=()=>'';
  assert.equal((await context.callHostedAiCoverLetter(job,'civil')).blocked,true);
  const savedGenerator=context.maybeGenerateAiCoverLetter;
  context.maybeGenerateAiCoverLetter=()=>Promise.resolve({blocked:true,message:'Pane locked'});
  context.jobMatchCanOpenPane=()=>true;
  for(const name of ['renderResults','renderSummary','setCoverLetterActionStatus'])context[name]=()=>{};
  const regeneration={civilLetter:'Selected draft',nhsLetter:'Selected draft',coverLetterOptions:[{civilLetter:'Selected draft',nhsLetter:'Selected draft'}],letterVariant:0};
  assert.equal(await context.regenerateLetter(regeneration),false);
  assert.equal(regeneration.civilLetter,'Selected draft');assert.equal(regeneration.coverLetterOptions.length,1);
  let regenerated;context.maybeGenerateAiCoverLetter=()=>new Promise(resolve=>regenerated=resolve);
  const regenerating=context.regenerateLetter(regeneration);
  assert.equal(await context.regenerateLetter(regeneration),false);
  regenerated({blocked:true});await regenerating;
  assert.equal(context.coverLetterGenerationBusy,false);
  context.maybeGenerateAiCoverLetter=savedGenerator;
  let handoffStatus=''; context.open=()=>null;context.copyCopilotPromptToClipboard=()=>true;
  assert.equal(context.openCopilotPrompt('Synthetic application prompt',(_tone,text)=>handoffStatus=text),true);
  assert.doesNotMatch(handoffStatus,/blocked/i);
  const cvStatus=node(); context.document.getElementById=id=>id==='cvBuilderStatus'?cvStatus:node(); context.navigator={};
  const cvSource=fs.readFileSync(path.join(root,'cv-generator.js'),'utf8').replace('  ensureOptionUi();','  window.__cvWorkflows={buildDocumentXml:buildDocumentXml,buildCvCopilotPrompt:buildCvCopilotPrompt,callHostedCvGeneration:callHostedCvGeneration};return;');
  vm.runInContext(cvSource,context);
  assert.equal((await context.__cvWorkflows.callHostedCvGeneration({roles:[]},[])).blocked,true);
  const documentXml=context.__cvWorkflows.buildDocumentXml({name:'Alex',roles:[{title:'Analyst',employer:'Example',dates:'2022 - Present',duties:['Validated reports.']}],skills:[],profile:'Reporting experience.'});
  assert.match(documentXml,/\u2022 Validated reports/);assert.doesNotMatch(documentXml,/\uFFFD/);
  const handoff=context.__cvWorkflows.buildCvCopilotPrompt({name:'Alex',roles:[],jobDescription:'Analyst'});
  assert.match(handoff,/downloadable Microsoft Word document/);assert.doesNotMatch(handoff,/expert UK CV writer/);
  let broadcasts=0;
  context.getCurrentHostedUser=()=>({email:'alex@example.com'});
  context._jobMatchLatestHostedPlanSnapshot={email:'alex@example.com',planType:'free'};
  context.loadJsonStorage=()=>({email:'alex@example.com',planType:'six_month'});
  context.applyHostedPlanBroadcast=()=>broadcasts++;
  for(const name of ['togglePageAccess','ensureHostedPlanRefreshHooks','refreshHostedPlanTypeFromSupabase','updateAccountSummary','updateAdminGeneratorShortcut'])context[name]=()=>{};
  context.renderAuthState();assert.equal(broadcasts,0,'Fresh server plans must outrank an old browser broadcast');
  console.log('Frontend workflows: ATS capitals and zero scores, cover-letter paragraphs/evidence, selected upload isolation, delayed-upload races, Rex clear/send races, and duplicate generation checks passed.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
