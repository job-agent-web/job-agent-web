(function(){
  var storageKey="jobMatchAgentCvBuilderDraft";
  var generatedTextKey="jobMatchAgentGeneratedCvText";
  var generatedCv=null;
  var elements={
    jumpBtn:gid("jumpCvBuilderBtn"),
    panel:gid("cvBuilderPanel"),
    closeBtn:gid("closeCvBuilderBtn"),
    name:gid("cvBuilderName"),
    phone:gid("cvBuilderPhone"),
    email:gid("cvBuilderEmail"),
    address:gid("cvBuilderAddress"),
    roleList:gid("cvRoleList"),
    addRoleBtn:gid("addCvRoleBtn"),
    certificationList:gid("cvCertificationList"),
    addCertificationBtn:gid("addCertificationBtn"),
    educationList:gid("cvEducationList"),
    addEducationBtn:gid("addEducationBtn"),
    jobDescription:gid("cvBuilderJobDescription"),
    syncJobBtn:gid("syncCvJobDescriptionBtn"),
    generateBtn:gid("generateCvBtn"),
    downloadBtn:gid("downloadCvDocxBtn"),
    status:gid("cvBuilderStatus"),
    preview:gid("generatedCvPreview"),
    jobPasteArea:gid("jobInput")
  };

  if(!elements.panel||!elements.roleList){return;}

  bindEvents();
  restoreDraft();
  if(!elements.roleList.children.length){addRoleCard();}
  updateRoleHeadings();

  function gid(id){return document.getElementById(id);}
  function trim(value){return String(value||"").replace(/^\s+|\s+$/g,"");}
  function low(value){return String(value||"").toLowerCase();}
  function esc(value){return String(value||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
  function unique(arr){var seen={},out=[],i,key;for(i=0;i<arr.length;i+=1){key=low(trim(arr[i]));if(!key||seen[key]){continue;}seen[key]=true;out.push(trim(arr[i]));}return out;}
  function isHostedHttpMode(){try{return /^https?:/i.test(String(window.location.protocol||""));}catch(e){return false;}}
  function getCvGenerationApiBase(){return isHostedHttpMode()?"":"https://job-match-agent-web.netlify.app";}
  function loadPreferredAiModel(){var raw="";try{raw=window.localStorage.getItem("jobMatchAgentOpenAiModel")||"";}catch(e){raw="";}raw=trim(raw);if(!raw||/^gpt-/i.test(raw)){return "gemini-2.5-flash-lite";}return raw;}
  function getAiHistory(){try{return window.jobMatchAiSessionMemory&&window.jobMatchAiSessionMemory.buildAvoidanceText?window.jobMatchAiSessionMemory.buildAvoidanceText("cv-builder"):"";}catch(e){return "";}}
  function aiProviderLabel(source,model){source=trim(source||"").toLowerCase();model=trim(model||loadPreferredAiModel());if(source==="gemini"||source==="browser-gemini"){return "Gemini"+(model?" - "+model:"");}if(source==="gptoss"||source==="gpt-oss"){return "GPT-OSS"+(model?" - "+model:"");}if(source==="cloudflare"){return "Cloudflare AI"+(model?" - "+model:"");}if(source==="huggingface"){return "Hugging Face"+(model?" - "+model:"");}if(source==="desktop"){return "Desktop OpenAI"+(model?" - "+model:"");}if(source==="hosted"){return "Hosted AI"+(model?" - "+model:"");}return model||"AI provider";}
  function setStatus(tone,text){if(!elements.status){return;}elements.status.className="auth-status "+tone;elements.status.innerHTML=esc(text);}
  function bindEvents(){
    if(elements.jumpBtn){elements.jumpBtn.onclick=function(){openPanel();return false;};}
    if(elements.closeBtn){elements.closeBtn.onclick=function(){closePanel();return false;};}
    if(elements.addRoleBtn){elements.addRoleBtn.onclick=function(){addRoleCard();persistDraft();return false;};}
    if(elements.addCertificationBtn){elements.addCertificationBtn.onclick=function(){addCredentialCard("certification");persistDraft();return false;};}
    if(elements.addEducationBtn){elements.addEducationBtn.onclick=function(){addCredentialCard("education");persistDraft();return false;};}
    if(elements.syncJobBtn){elements.syncJobBtn.onclick=function(){syncJobDescription();return false;};}
    if(elements.generateBtn){elements.generateBtn.onclick=function(){generateCv();return false;};}
    if(elements.downloadBtn){elements.downloadBtn.onclick=function(){downloadCvDocx();return false;};}
    elements.roleList.onclick=function(event){handleRoleListClick(event);};
    if(elements.certificationList){elements.certificationList.onclick=function(event){handleCredentialListClick(event,"certification");};elements.certificationList.oninput=function(){persistDraft();};}
    if(elements.educationList){elements.educationList.onclick=function(event){handleCredentialListClick(event,"education");};elements.educationList.oninput=function(){persistDraft();};}
    elements.roleList.oninput=function(){persistDraft();};
    if(elements.name){elements.name.oninput=persistDraft;}
    if(elements.phone){elements.phone.oninput=persistDraft;}
    if(elements.email){elements.email.oninput=persistDraft;}
    if(elements.address){elements.address.oninput=persistDraft;}
    if(elements.jobDescription){elements.jobDescription.oninput=persistDraft;}
  }
  function hasClass(node,className){return (" "+(node.className||"")+" ").indexOf(" "+className+" ")!==-1;}
  function handleRoleListClick(event){
    var target=event.target||event.srcElement,card;
    if(!target){return;}
    if(hasClass(target,"remove-role-btn")){
      card=findRoleCard(target,elements.roleList,"cv-role-card");
      if(card&&elements.roleList.children.length>1){elements.roleList.removeChild(card);updateRoleHeadings();persistDraft();}
    }
  }
  function handleCredentialListClick(event,type){
    var target=event.target||event.srcElement,list=type==="certification"?elements.certificationList:elements.educationList,card;
    if(!target||!list){return;}
    if(hasClass(target,"remove-credential-btn")){
      card=findRoleCard(target,list,"cv-credential-card");
      if(card&&list.children.length>1){list.removeChild(card);persistDraft();}
    }
  }
  function findRoleCard(node,parent,className){while(node&&node!==parent&&!hasClass(node,className)){node=node.parentNode;}return hasClass(node,className)?node:null;}
  function createInput(labelText,className,type,placeholder){var label=document.createElement("label"),input=document.createElement("input");label.innerHTML=labelText;input.type=type||"text";input.className=className||"";if(placeholder){input.placeholder=placeholder;}label.appendChild(input);return label;}
  function createTextarea(labelText,className,placeholder){var label=document.createElement("label"),textarea=document.createElement("textarea");label.innerHTML=labelText;textarea.className=className||"";textarea.rows=4;textarea.placeholder=placeholder||"";label.className="full-span";label.appendChild(textarea);return label;}
  function addRoleCard(data){
    var card=document.createElement("article"),top=document.createElement("div"),titleWrap=document.createElement("div"),title=document.createElement("h4"),meta=document.createElement("p"),removeBtn=document.createElement("button"),grid=document.createElement("div"),titleLabel,employerLabel,dateGrid,startLabel,endLabel,currentLabel,notesLabel;
    card.className="cv-role-card";
    top.className="cv-role-card-top";
    title.textContent="Role";
    meta.className="job-meta";
    meta.textContent="Add a past role so the generator can tailor duties to the target job description.";
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);
    removeBtn.className="ghost-button small-button remove-role-btn";
    removeBtn.type="button";
    removeBtn.textContent="Remove";
    top.appendChild(titleWrap);
    top.appendChild(removeBtn);
    grid.className="cv-role-grid";
    titleLabel=createInput("Job role","cv-role-title","text","Data Analyst");
    employerLabel=createInput("Employer","cv-role-employer","text","Example Organisation");
    dateGrid=document.createElement("div");
    dateGrid.className="cv-date-grid full-span";
    startLabel=createInput("Start date","cv-role-start","date","");
    endLabel=createInput("End date","cv-role-end","date","");
    currentLabel=document.createElement("label");
    currentLabel.className="cv-current-wrap";
    currentLabel.innerHTML='<input class="cv-role-current" type="checkbox"> Current role';
    dateGrid.appendChild(startLabel);
    dateGrid.appendChild(endLabel);
    dateGrid.appendChild(currentLabel);
    notesLabel=createTextarea("Role highlights / context","cv-role-notes","Paste achievements, tools, responsibilities, or project highlights from this role.");
    grid.appendChild(titleLabel);
    grid.appendChild(employerLabel);
    grid.appendChild(dateGrid);
    grid.appendChild(notesLabel);
    card.appendChild(top);
    card.appendChild(grid);
    elements.roleList.appendChild(card);
    if(data){
      card.querySelector(".cv-role-title").value=data.title||"";
      card.querySelector(".cv-role-employer").value=data.employer||"";
      card.querySelector(".cv-role-start").value=data.start||"";
      card.querySelector(".cv-role-end").value=data.end||"";
      card.querySelector(".cv-role-current").checked=!!data.current;
      card.querySelector(".cv-role-notes").value=data.notes||"";
    }
    bindRoleCard(card);
    updateRoleHeadings();
    return card;
  }
  function addCredentialCard(type,data){
    var list=type==="certification"?elements.certificationList:elements.educationList,card=document.createElement("article"),top=document.createElement("div"),titleWrap=document.createElement("div"),title=document.createElement("h4"),meta=document.createElement("p"),removeBtn=document.createElement("button"),grid=document.createElement("div"),nameLabel,issuerLabel,dateLabel,notesLabel;
    if(!list){return null;}
    card.className="cv-role-card cv-credential-card";
    top.className="cv-role-card-top";
    title.textContent=type==="certification"?"Certification":"Education";
    meta.className="job-meta";
    meta.textContent=type==="certification"?"Capture the qualification name, issuer, and date awarded.":"Capture the qualification, institution, and completion date.";
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);
    removeBtn.className="ghost-button small-button remove-credential-btn";
    removeBtn.type="button";
    removeBtn.textContent="Remove";
    top.appendChild(titleWrap);
    top.appendChild(removeBtn);
    grid.className="cv-role-grid";
    nameLabel=createInput(type==="certification"?"Certification":"Qualification","cv-credential-name","text",type==="certification"?"Level 3 Business Analysis Certificate":"BSc Data Science");
    issuerLabel=createInput(type==="certification"?"Issuer / provider":"Institution","cv-credential-issuer","text",type==="certification"?"BCS":"University of Wales");
    dateLabel=createInput(type==="certification"?"Awarded date":"Completion date","cv-credential-date","date","");
    notesLabel=createTextarea("Notes (optional)","cv-credential-notes","Add grade, distinction, module focus, or other useful context.");
    grid.appendChild(nameLabel);
    grid.appendChild(issuerLabel);
    grid.appendChild(dateLabel);
    grid.appendChild(notesLabel);
    card.appendChild(top);
    card.appendChild(grid);
    list.appendChild(card);
    if(data){
      card.querySelector(".cv-credential-name").value=data.name||"";
      card.querySelector(".cv-credential-issuer").value=data.issuer||"";
      card.querySelector(".cv-credential-date").value=data.date||"";
      card.querySelector(".cv-credential-notes").value=data.notes||"";
    }
    return card;
  }
  function bindRoleCard(card){
    var current=card.querySelector(".cv-role-current"),endDate=card.querySelector(".cv-role-end");
    function syncCurrent(){if(!current||!endDate){return;}endDate.disabled=!!current.checked;if(current.checked){endDate.value="";}}
    if(current){current.onchange=function(){syncCurrent();persistDraft();};syncCurrent();}
  }
  function updateRoleHeadings(){
    var cards=elements.roleList.getElementsByClassName("cv-role-card"),i,title,meta,roleTitle;
    for(i=0;i<cards.length;i+=1){title=cards[i].getElementsByTagName("h4")[0];meta=cards[i].getElementsByClassName("job-meta")[0];roleTitle=trim(cards[i].querySelector(".cv-role-title").value)||"Role "+(i+1);if(title){title.textContent=roleTitle;}if(meta){meta.textContent="Experience entry "+(i+1)+" will receive tailored duties aligned with the target advert.";}}
  }
  function collectRoles(){var cards=elements.roleList.getElementsByClassName("cv-role-card"),roles=[],i,role;for(i=0;i<cards.length;i+=1){role={title:trim(cards[i].querySelector(".cv-role-title").value),employer:trim(cards[i].querySelector(".cv-role-employer").value),start:trim(cards[i].querySelector(".cv-role-start").value),end:trim(cards[i].querySelector(".cv-role-end").value),current:!!cards[i].querySelector(".cv-role-current").checked,notes:trim(cards[i].querySelector(".cv-role-notes").value)};if(role.title||role.employer||role.notes){roles.push(role);}}return roles;}
  function collectCredentials(type){
    var list=type==="certification"?elements.certificationList:elements.educationList,cards=list?list.getElementsByClassName("cv-credential-card"):[],items=[],i,item;
    for(i=0;i<cards.length;i+=1){item={name:trim(cards[i].querySelector(".cv-credential-name").value),issuer:trim(cards[i].querySelector(".cv-credential-issuer").value),date:trim(cards[i].querySelector(".cv-credential-date").value),notes:trim(cards[i].querySelector(".cv-credential-notes").value)};if(item.name||item.issuer||item.date||item.notes){items.push(item);}}
    return items;
  }
  function collectData(){return {name:trim(elements.name&&elements.name.value),phone:trim(elements.phone&&elements.phone.value),email:trim(elements.email&&elements.email.value),address:trim(elements.address&&elements.address.value),roles:collectRoles(),certifications:collectCredentials("certification"),education:collectCredentials("education"),jobDescription:trim(elements.jobDescription&&elements.jobDescription.value)};}
  function persistDraft(){var data={name:elements.name?elements.name.value:"",phone:elements.phone?elements.phone.value:"",email:elements.email?elements.email.value:"",address:elements.address?elements.address.value:"",roles:collectRoles(),certifications:collectCredentials("certification"),education:collectCredentials("education"),jobDescription:elements.jobDescription?elements.jobDescription.value:""};try{window.localStorage.setItem(storageKey,JSON.stringify(data));}catch(e){}updateRoleHeadings();}
  function restoreDraft(){var raw="",data,i;try{raw=window.localStorage.getItem(storageKey)||"";}catch(e){raw="";}if(!raw){return;}try{data=JSON.parse(raw)||{};}catch(err){data={};}if(elements.name){elements.name.value=data.name||"";}if(elements.phone){elements.phone.value=data.phone||"";}if(elements.email){elements.email.value=data.email||"";}if(elements.address){elements.address.value=data.address||"";}if(elements.jobDescription){elements.jobDescription.value=data.jobDescription||"";}elements.roleList.innerHTML="";if(elements.certificationList){elements.certificationList.innerHTML="";}if(elements.educationList){elements.educationList.innerHTML="";}if(data.roles&&data.roles.length){for(i=0;i<data.roles.length;i+=1){addRoleCard(data.roles[i]);}}if(data.certifications&&data.certifications.length){for(i=0;i<data.certifications.length;i+=1){addCredentialCard("certification",data.certifications[i]);}}if(data.education&&data.education.length){for(i=0;i<data.education.length;i+=1){addCredentialCard("education",data.education[i]);}}}
  function openPanel(){if(!elements.panel){return;}if(window.toggleCvBuilderPanel){window.toggleCvBuilderPanel(true);}try{elements.panel.scrollIntoView({behavior:"smooth",block:"start"});}catch(e){}try{if(elements.name){elements.name.focus();}}catch(err){}}
  function closePanel(){if(!elements.panel){return;}if(window.toggleCvBuilderPanel){window.toggleCvBuilderPanel(false);}}
  function syncJobDescription(){var source=trim(elements.jobPasteArea&&elements.jobPasteArea.value),parsed="";if(!source){setStatus("bad","Add the target job description in pane two first, then use this shortcut.");return;}parsed=extractDescriptionBlock(source);if(elements.jobDescription){elements.jobDescription.value=parsed;}persistDraft();setStatus("good","The job description pane has been filled from pane two.");}
  function extractDescriptionBlock(text){var match=String(text||"").match(/description\s*:\s*([\s\S]*)/i);return trim(match?match[1]:text);}
  async function generateCv(){var data=collectData(),doc=null,result=null;if(window.jobMatchCvPolicy&&typeof window.jobMatchCvPolicy.canGenerate==="function"&&!window.jobMatchCvPolicy.canGenerate()){setStatus("bad","Your CV generation balance has been used up for this account.");return;}if(!data.name||!data.phone||!data.email||!data.address){setStatus("bad","Add the full name, email, phone number, and address before generating the CV.");return;}if(!data.roles.length){setStatus("bad","Add at least one previous role so the generator can build tailored duties.");return;}if(!data.jobDescription){setStatus("bad","Paste the target job description so the duties can be tailored to the exact vacancy.");return;}setStatus("neutral","Generating a unique CV draft...");result=await callHostedCvGeneration(data);if(result&&result.ok&&result.document){doc=result.document;}if(!doc){doc=buildCvDocument(data);}generatedCv=doc;persistGeneratedCvText(doc);publishGeneratedCv();renderPreview(doc);if(window.updateCoverLetterCvSourceStatus){window.updateCoverLetterCvSourceStatus();}if(window.refreshCoverLetterReadiness){window.refreshCoverLetterReadiness();}if(window.jobMatchRecordAiModelUsage){window.jobMatchRecordAiModelUsage("cv-builder",result&&result.ok?aiProviderLabel(result.source,result.model):"Built-in local CV generator",result&&result.ok?"AI providers were tried for 3 cycles before this CV provider succeeded. The indicator shows the latest provider used for generated CV.":"AI providers were tried for 3 cycles before the local CV generator was used.",{model:result&&result.model?result.model:"",source:result&&result.ok?(result.source||"hosted"):"local"});}if(window.jobMatchAiSessionMemory&&window.jobMatchAiSessionMemory.remember){window.jobMatchAiSessionMemory.remember("cv-builder",buildGeneratedCvPlainText(doc),{name:data.name});}if(elements.downloadBtn){elements.downloadBtn.hidden=false;}if(window.jobMatchCvPolicy&&typeof window.jobMatchCvPolicy.consume==="function"){window.jobMatchCvPolicy.consume();}if(result&&result.ok){setStatus("good","Your tailored CV has been generated with "+(result.model||loadPreferredAiModel())+". Review it below and download the Word version when ready.");}else if(result&&result.attempted){setStatus("warn",(result.message||"Hosted AI CV generation was unavailable after trying providers for 3 cycles.")+" Built-in CV generation was used instead.");}else{setStatus("good","Your tailored CV has been generated. Review it below and download the Word version when ready.");}}
  async function callHostedCvGeneration(data){var response,payload,base=getCvGenerationApiBase();try{response=await fetch(base+"/.netlify/functions/generate-cv",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model:loadPreferredAiModel(),data:data,previousOutputs:getAiHistory()})});payload=await response.json();if(!payload||!payload.ok||!payload.document){return {attempted:true,ok:false,message:(payload&&payload.message)||"Hosted AI CV generation is not configured yet after trying providers for 3 cycles."};}return {attempted:true,ok:true,document:normalizeHostedCvDocument(payload.document,data),model:payload.model||loadPreferredAiModel(),source:payload.provider||"hosted"};}catch(error){return {attempted:true,ok:false,message:"Could not reach the hosted AI CV service right now."};}}
  function normalizeHostedCvDocument(doc,input){var normalizedRoles=[],roles=(doc&&doc.roles)||[],i,role,duties,sourceRole;for(i=0;i<roles.length;i+=1){role=roles[i]||{};sourceRole=input.roles&&input.roles[i]?input.roles[i]:{};duties=unique((role.duties||[]).map(function(item){return trim(item);})).slice(0,4);if(!duties.length&&sourceRole){duties=buildRoleSection(sourceRole,extractRequirements(input.jobDescription),extractSkillKeywords(input.jobDescription,input.roles),i,input.roles.length,input.jobDescription).duties;}normalizedRoles.push({title:trim(role.title||sourceRole.title||"Professional Experience"),employer:trim(role.employer||sourceRole.employer||"Organisation not specified"),dates:trim(role.dates||formatDateRange(sourceRole.start,sourceRole.end,sourceRole.current)),duties:duties});}return {name:trim(doc&&doc.name||input.name),phone:trim(doc&&doc.phone||input.phone),email:trim(doc&&doc.email||input.email),address:trim(doc&&doc.address||input.address),profile:trim(doc&&doc.profile)||buildProfessionalProfile(input,extractRequirements(input.jobDescription),extractSkillKeywords(input.jobDescription,input.roles)),skills:unique(doc&&doc.skills||extractSkillKeywords(input.jobDescription,input.roles)).slice(0,12),roles:normalizedRoles.length?normalizedRoles:buildCvDocument(input).roles,certifications:normalizeCredentialCollection(doc&&doc.certifications,input.certifications),education:normalizeCredentialCollection(doc&&doc.education,input.education),fileName:safeFileName((input.name||"generated_cv")+"_CV.docx")};}
  function normalizeCredentialCollection(items,fallback){var out=[],source=items&&items.length?items:(fallback||[]),i,item,line;for(i=0;i<source.length;i+=1){item=source[i]||{};line=trim(typeof item==="string"?item:(item.line||""));if(line){out.push({line:line});continue;}if(item.name||item.issuer||item.date||item.notes){out.push({name:item.name||"",issuer:item.issuer||"",date:item.date||"",notes:item.notes||""});}}return out;}
  function buildCvDocument(data){var requirements=extractRequirements(data.jobDescription),skills=extractSkillKeywords(data.jobDescription,data.roles),roles=[],i;for(i=0;i<data.roles.length;i+=1){roles.push(buildRoleSection(data.roles[i],requirements,skills,i,data.roles.length,data.jobDescription));}return {name:data.name,phone:data.phone,email:data.email,address:data.address,profile:buildProfessionalProfile(data,requirements,skills),skills:skills.slice(0,12),roles:roles,certifications:data.certifications,education:data.education,fileName:safeFileName(data.name+"_CV_"+(skills[0]||"tailored")+".docx")};}
  function extractRequirements(text){var lines=String(text||"").split(/\r?\n/),out=[],i,line,cleaned,sentences;for(i=0;i<lines.length;i+=1){line=trim(lines[i]);if(!line){continue;}cleaned=line.replace(/^[-*•]\s*/,"");if(cleaned.length<18){continue;}if(/^[-*•]/.test(line)||contains(low(cleaned),["responsible for","you will","key responsibilities","main responsibilities","skills","requirements","essential","desirable","experience of","ability to","knowledge of","supporting","managing","analys","reporting","stakeholder","communication","documentation","coordinat"])){out.push(cleanRequirement(cleaned));}}if(!out.length){sentences=String(text||"").split(/(?<=[\.!?])\s+/);for(i=0;i<sentences.length&&out.length<8;i+=1){if(trim(sentences[i]).length>24){out.push(cleanRequirement(sentences[i]));}}}if(!out.length){out=["accurate communication and documentation","strong stakeholder support","dependable delivery of role priorities","clear reporting and organised administration"]; }return unique(out).slice(0,10);}
  function cleanRequirement(text){return trim(String(text||"").replace(/\s+/g," ").replace(/[;:]+$/,""));}
  function extractSkillKeywords(text,roles){var source=low(String(text||"")),keywords=[],matches=["excel","sql","power bi","tableau","python","reporting","analysis","dashboard","kpi","stakeholder management","communication","coordination","administration","documentation","data quality","record management","microsoft 365","governance","compliance","planning","service delivery","customer service","patient administration","minute taking","project support","problem solving","data interpretation","quality assurance","relationship building","process improvement","information management","scheduling","presentation skills","team collaboration","decision support","regulatory compliance"],fallbacks=["communication","stakeholder management","documentation","organisation","reporting","analysis","service delivery","problem solving","coordination","record management","data quality","team collaboration"],roleText="",i;for(i=0;i<matches.length;i+=1){if(source.indexOf(matches[i])!==-1){keywords.push(matches[i]);}}if(roles&&roles.length){for(i=0;i<roles.length;i+=1){roleText+=" "+low((roles[i].title||"")+" "+(roles[i].notes||""));}if(contains(roleText,["analyst","reporting","insight","dashboard","sql","excel"])) {keywords.push("data analysis","reporting","dashboard development","excel","sql");}if(contains(roleText,["admin","administrator","documentation","record","office","coordinator"])) {keywords.push("administration","record management","documentation","microsoft 365","coordination");}if(contains(roleText,["support","service","customer","patient","liaison"])) {keywords.push("customer service","service delivery","communication","relationship building","stakeholder management");}if(contains(roleText,["project","programme","delivery","planning","implementation"])) {keywords.push("project support","planning","coordination","process improvement","quality assurance");}}keywords=unique(keywords);for(i=0;i<fallbacks.length&&keywords.length<10;i+=1){keywords.push(fallbacks[i]);keywords=unique(keywords);}return keywords.slice(0,12);}
  function buildProfessionalProfile(data,requirements,skills){var leadSkill=skills[0]?capitalize(skills[0]):"professional operations",roleSummary=summariseRoleTitles(data.roles),priorityOne=requirements[0]?requirements[0].toLowerCase():"service delivery, accurate documentation, and dependable operational support",priorityTwo=requirements[1]?requirements[1].toLowerCase():"clear reporting, stakeholder communication, and organised follow-through",skillSummary=skills.slice(0,5).join(", "),text="Results-driven professional with proven experience across "+roleSummary+", recognised for translating complex requirements into clear, high-quality delivery that strengthens operational performance and decision-making. Combines strong capability in "+leadSkill+" with a practical record of supporting "+priorityOne+" and "+priorityTwo+" in fast-paced, service-focused environments. Brings a credible mix of analytical thinking, organised execution, and professional stakeholder support, with particular strength in "+skillSummary+" to help teams deliver accurate outputs, improve efficiency, and maintain consistently high standards.";return text;}
  function summariseRoleTitles(roles){var titles=roles.map(function(role){return role.title||"professional experience";}).slice(0,4);if(titles.length===1){return titles[0];}if(titles.length===2){return titles[0]+" and "+titles[1];}return titles.slice(0,titles.length-1).join(", ")+", and "+titles[titles.length-1];}
  function inferRoleFamily(role){var text=low((role.title||"")+" "+(role.notes||""));if(contains(text,["analyst","reporting","data","insight","dashboard","sql","excel"])){return "data";}if(contains(text,["admin","administrator","record","documentation","office","minute","coordinator"])){return "admin";}if(contains(text,["support","service","customer","patient","liaison","adviser"])){return "support";}if(contains(text,["project","programme","program","delivery","planning","implementation"])){return "delivery";}return "general";}
  function inferTargetRoleTitle(jobDescription){var text=String(jobDescription||""),lines=text.split(/\r?\n/),i,line,match;for(i=0;i<lines.length;i+=1){line=trim(lines[i]);match=line.match(/^(job\s*title|role|position|vacancy)\s*[:\-]\s*(.+)$/i);if(match&&trim(match[2])){return trim(match[2]).replace(/[.;]+$/g,"");}}match=text.match(/(?:apply for|applications? for|recruiting for|seeking)\s+(?:an?\s+)?([A-Za-z][A-Za-z\s\/&-]{3,80}?)(?:\s+role|\s+position|\s+vacancy|\s+at|\s+with|\.|,|\n)/i);return match?trim(match[1]):"target role";}
  function roleTitleTokens(title){var stop={and:1,the:1,for:1,with:1,assistant:0,manager:0,officer:0,analyst:0,administrator:0,coordinator:0,specialist:0,executive:0,lead:0,support:0,project:0,programme:0,program:0,data:0,healthcare:0,clinical:0,business:0,service:0,customer:0};return unique(String(title||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(function(word){return word&&word.length>2&&!stop[word]||stop[word]===0;}));}
  function requirementMatchesRole(requirement,tokens){var text=low(requirement),i;if(!tokens||!tokens.length){return 0;}for(i=0;i<tokens.length;i+=1){if(text.indexOf(tokens[i])!==-1){return 2;}}return 0;}
  function orderRequirementsForRole(role,requirements,skills,jobDescription){var tokens=roleTitleTokens((role.title||"")+" "+(role.notes||"")),scored=[],i,req,score;for(i=0;i<requirements.length;i+=1){req=requirements[i];score=requirementMatchesRole(req,tokens);if(contains(low(req),["responsible","you will","main duties","key responsibilities"])){score+=1;}if(contains(low((role.title||"")+" "+(role.notes||"")),["data","analyst","reporting","dashboard"])&&contains(low(req),["data","analys","report","dashboard","insight","excel","sql"])){score+=3;}if(contains(low((role.title||"")+" "+(role.notes||"")),["admin","administrator","coordinator","assistant","office"])&&contains(low(req),["admin","document","record","meeting","schedule","coordinate","minute","diary"])){score+=3;}if(contains(low((role.title||"")+" "+(role.notes||"")),["care","health","nurse","patient","clinical"])&&contains(low(req),["patient","care","clinical","health","safeguard","service user"])){score+=3;}if(contains(low((role.title||"")+" "+(role.notes||"")),["project","programme","program","delivery"])&&contains(low(req),["project","programme","delivery","milestone","risk","stakeholder","implementation"])){score+=3;}scored.push({text:req,score:score,index:i});}scored.sort(function(a,b){return b.score-a.score||a.index-b.index;});return scored.map(function(item){return item.text;});}
  function buildRoleSection(role,requirements,skills,roleIndex,totalRoles,jobDescription){var roleTitle=trim(role.title)||"Professional Experience",family=inferRoleFamily(role),notes=role.notes?trim(role.notes):"",targetRole=inferTargetRoleTitle(jobDescription),ordered=orderRequirementsForRole(role,requirements,skills,jobDescription),focus=ordered.slice(0,4);while(focus.length<4){focus.push(requirements[(focus.length+roleIndex)%requirements.length]);}var duties=[],templates=getRoleDutyTemplates(family),i,evidence; evidence=buildEvidencePhrase(role,skills);for(i=0;i<templates.length&&duties.length<4;i+=1){duties.push(fillRoleDutyTemplate(templates[i],roleTitle,targetRole,focus[i%focus.length],evidence,skills,roleIndex,i));}duties=unique(duties);return {title:roleTitle,employer:role.employer||"Organisation not specified",dates:formatDateRange(role.start,role.end,role.current),duties:duties,notes:notes};}
  function getRoleDutyTemplates(family){var templates={data:["As {roleTitle}, analysed evidence linked to {requirement} for the {targetRole} advert, using {evidence} to produce accurate outputs and practical recommendations.","As {roleTitle}, built clear reporting and tracking around {requirement}, giving stakeholders reliable insight into progress, risks, trends, and next actions.","As {roleTitle}, translated complex information about {requirement} into concise updates, helping managers make timely and evidence-based decisions.","As {roleTitle}, strengthened data quality, documentation, and follow-up for {requirement}, improving consistency and confidence in the final outputs."],admin:["As {roleTitle}, coordinated {requirement} through organised administration, accurate records, and dependable follow-up that mirrors the needs of the {targetRole} role.","As {roleTitle}, managed documentation, scheduling, and action tracking around {requirement}, helping work move forward efficiently and professionally.","As {roleTitle}, supported colleagues and stakeholders with clear communication on {requirement}, ensuring information was handled accurately and on time.","As {roleTitle}, improved the structure and reliability of processes linked to {requirement}, creating a more consistent and service-focused way of working."],support:["As {roleTitle}, provided responsive support around {requirement}, using {evidence} to deliver practical help aligned with the {targetRole} requirements.","As {roleTitle}, handled responsibilities linked to {requirement} with empathy, professionalism, accuracy, and strong follow-through.","As {roleTitle}, coordinated updates, documentation, and next steps for {requirement}, contributing to smoother service delivery and better stakeholder confidence.","As {roleTitle}, built trust with colleagues, service users, or customers by keeping communication clear and actions around {requirement} well organised."],delivery:["As {roleTitle}, coordinated activity linked to {requirement}, keeping plans visible, organised, and aligned with the delivery expectations of the {targetRole} advert.","As {roleTitle}, tracked progress, actions, dependencies, and risks around {requirement}, giving teams clearer oversight of delivery priorities.","As {roleTitle}, supported implementation work connected to {requirement} through structured communication, documentation, and timely escalation of issues.","As {roleTitle}, improved consistency in programme or project activity by strengthening how {requirement} was planned, monitored, and completed."],general:["As {roleTitle}, delivered work directly connected to {requirement}, applying {evidence} in a way that supports the priorities of the {targetRole} role.","As {roleTitle}, supported day-to-day priorities around {requirement}, helping colleagues and stakeholders work from clear, accurate, and timely information.","As {roleTitle}, handled responsibilities linked to {requirement} in a structured way, maintaining professional standards and dependable communication.","As {roleTitle}, contributed to stronger outcomes by improving how {requirement} was managed, documented, progressed, and reviewed."]};return templates[family]||templates.general;}
  function buildEvidencePhrase(role,skills){var notes=trim(role.notes||""),snippets,skillText;if(notes){snippets=notes.split(/\r?\n|[.;]/).map(function(item){return trim(item);}).filter(Boolean);if(snippets.length){return snippets[0].charAt(0).toLowerCase()+snippets[0].slice(1);}}skillText=skills&&skills.length?skills.slice(0,2).join(" and "):"strong organisation and communication";return "practical experience in "+skillText;}
  function fillRoleDutyTemplate(template,roleTitle,targetRole,requirement,evidence,skills,roleIndex,bulletIndex){var verbs=["Consistently","Successfully","Proactively","Effectively","Dependably"],roleSkill=skills&&skills.length?skills[(roleIndex+bulletIndex)%skills.length]:"service delivery",text=template.replace(/\{roleTitle\}/g,roleTitle).replace(/\{targetRole\}/g,targetRole||"target role").replace(/\{requirement\}/g,lowercaseFirst(requirement)).replace(/\{evidence\}/g,evidence||("hands-on work in "+roleSkill));return verbs[(roleIndex+bulletIndex)%verbs.length]+" "+lowercaseFirst(text);}  function lowercaseFirst(text){return text?text.charAt(0).toLowerCase()+text.slice(1):"";}  function capitalize(text){return text?text.charAt(0).toUpperCase()+text.slice(1):"";}  function contains(text,parts){var i;for(i=0;i<parts.length;i+=1){if(String(text||"").indexOf(parts[i])!==-1){return true;}}return false;}
  function formatDateRange(start,end,current){var startText=formatDate(start),endText=current?"Present":formatDate(end);if(!startText&&!endText){return "Dates not specified";}if(!startText){return endText;}if(!endText){return startText+(current?" - Present":"");}return startText+" - "+endText;}
  function formatDate(value){var date,months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];if(!value){return "";}date=new Date(value);if(isNaN(date.getTime())){return value;}return months[date.getMonth()]+' '+date.getFullYear();}
  function formatCredentialLine(item){var parts=[];if(item.name){parts.push(item.name);}if(item.issuer){parts.push(item.issuer);}if(item.date){parts.push(formatDate(item.date));}if(item.notes){parts.push(item.notes);}return parts.join(' | ');}
  function renderPreview(doc){var html='',i;html+='<article class="generated-cv-document generated-cv-document-match"><header class="generated-cv-header"><h2>'+esc(doc.name)+'</h2><p class="generated-cv-contact">'+esc(doc.email)+' | '+esc(doc.phone)+'</p><p class="generated-cv-contact generated-cv-address">'+esc(doc.address)+'</p></header>';html+='<section class="generated-cv-section"><h3>PROFESSIONAL PROFILE</h3><p class="generated-cv-profile">'+esc(doc.profile)+'</p></section>';if(doc.skills&&doc.skills.length){html+='<section class="generated-cv-section"><h3>CORE SKILLS</h3><p class="generated-cv-inline-list">'+esc(doc.skills.join(' | '))+'</p></section>';}html+='<section class="generated-cv-section"><h3>PROFESSIONAL EXPERIENCE</h3>';for(i=0;i<doc.roles.length;i+=1){html+=renderRolePreview(doc.roles[i]);}html+='</section>';if(doc.certifications&&doc.certifications.length){html+='<section class="generated-cv-section"><h3>CERTIFICATIONS</h3><ul class="generated-cv-list">';for(i=0;i<doc.certifications.length;i+=1){html+='<li>'+esc(formatCredentialLine(doc.certifications[i]))+'</li>';}html+='</ul></section>';}if(doc.education&&doc.education.length){html+='<section class="generated-cv-section"><h3>EDUCATION</h3><ul class="generated-cv-list">';for(i=0;i<doc.education.length;i+=1){html+='<li>'+esc(formatCredentialLine(doc.education[i]))+'</li>';}html+='</ul></section>';}html+='</article>';elements.preview.className='generated-cv-preview';elements.preview.innerHTML=html;}
  function renderRolePreview(role){var html='',i;html+='<article class="generated-cv-role generated-cv-role-match"><p class="generated-cv-role-heading">'+esc(role.title+' | '+role.employer)+'</p><p class="generated-cv-role-date">'+esc(role.dates)+'</p><ul class="generated-cv-list">';for(i=0;i<role.duties.length;i+=1){html+='<li>'+esc(role.duties[i])+'</li>';}html+='</ul></article>';return html;}
  function safeFileName(name){return String(name||"generated_cv.docx").replace(/[\\/:*?"<>|]+/g," ").replace(/\s+/g," ").replace(/^\s+|\s+$/g,"");}
  function buildGeneratedCvPlainText(doc){var parts=[],i,j; if(!doc){return "";} parts.push(doc.name); parts.push(doc.email+' | '+doc.phone); parts.push(doc.address); parts.push(""); parts.push("Professional Profile"); parts.push(doc.profile); parts.push(""); if(doc.skills&&doc.skills.length){parts.push("Core Skills"); parts.push(doc.skills.join(", ")); parts.push("");} parts.push("Professional Experience"); for(i=0;i<doc.roles.length;i+=1){parts.push((doc.roles[i].title||"Professional Experience")+" | "+(doc.roles[i].employer||"")); parts.push(doc.roles[i].dates||""); for(j=0;j<doc.roles[i].duties.length;j+=1){parts.push("- "+doc.roles[i].duties[j]);} parts.push("");} if(doc.certifications&&doc.certifications.length){parts.push("Certifications"); for(i=0;i<doc.certifications.length;i+=1){parts.push("- "+formatCredentialLine(doc.certifications[i]));} parts.push("");} if(doc.education&&doc.education.length){parts.push("Education"); for(i=0;i<doc.education.length;i+=1){parts.push("- "+formatCredentialLine(doc.education[i]));}} return parts.join("\n");}
  function persistGeneratedCvText(doc){try{if(window.localStorage){window.localStorage.setItem(generatedTextKey,buildGeneratedCvPlainText(doc));}}catch(e){}}  function loadStoredGeneratedCvText(){try{return window.localStorage?trim(window.localStorage.getItem(generatedTextKey)||""):"";}catch(e){return "";}}  function publishGeneratedCv(){window.jobMatchGeneratedCvAccess={hasGeneratedCv:function(){return !!generatedCv||!!loadStoredGeneratedCvText();},getText:function(){return buildGeneratedCvPlainText(generatedCv)||loadStoredGeneratedCvText();},getDocument:function(){return generatedCv;},openPanel:function(){openPanel();}};}
  function downloadCvDocx(){if(!generatedCv){setStatus("bad","Generate the CV first before downloading the Word document.");return;}if(!window.JSZip){setStatus("bad","The Word export library is not available on this page yet.");return;}buildDocxBlob(generatedCv).then(function(blob){var url=(window.URL||window.webkitURL).createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=generatedCv.fileName||"generated_cv.docx";document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){(window.URL||window.webkitURL).revokeObjectURL(url);},1000);}).catch(function(){setStatus("bad","The Word document could not be created right now.");});}
  function buildDocxBlob(doc){var zip=new window.JSZip();zip.file('[Content_Types].xml',buildContentTypesXml());zip.folder('_rels').file('.rels',buildRootRelsXml());zip.folder('word').file('document.xml',buildDocumentXml(doc));return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});}  function buildContentTypesXml(){return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+'<Default Extension="xml" ContentType="application/xml"/>'+'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+'</Types>';}  function buildRootRelsXml(){return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'+'</Relationships>';}
  function buildDocumentXml(doc){var body=[];body.push(xmlParagraph(doc.name,'name'));body.push(xmlParagraph(doc.email+' | '+doc.phone,'contact'));body.push(xmlParagraph(doc.address,'contact'));body.push(xmlParagraph('PROFESSIONAL PROFILE','heading'));body.push(xmlParagraph(doc.profile,'body'));if(doc.skills&&doc.skills.length){body.push(xmlParagraph('CORE SKILLS','heading'));body.push(xmlParagraph(doc.skills.join(' | '),'body'));}body.push(xmlParagraph('PROFESSIONAL EXPERIENCE','heading'));doc.roles.forEach(function(role){body.push(xmlParagraph(role.title+' | '+role.employer,'role'));body.push(xmlParagraph(role.dates,'date'));role.duties.forEach(function(duty){body.push(xmlParagraph('• '+duty,'bullet'));});});if(doc.certifications&&doc.certifications.length){body.push(xmlParagraph('CERTIFICATIONS','heading'));doc.certifications.forEach(function(item){body.push(xmlParagraph('• '+formatCredentialLine(item),'bullet'));});}if(doc.education&&doc.education.length){body.push(xmlParagraph('EDUCATION','heading'));doc.education.forEach(function(item){body.push(xmlParagraph('• '+formatCredentialLine(item),'bullet'));});}return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+'<w:body>'+body.join('')+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';}
  function xmlParagraph(text,style){var align='left',bold=false,size='22';if(style==='name'){align='center';bold=true;size='34';}else if(style==='contact'){align='center';size='20';}else if(style==='heading'){bold=true;size='24';}else if(style==='role'){bold=true;size='23';}else if(style==='date'){size='20';}return '<w:p><w:pPr>'+xmlAlignment(align)+'</w:pPr><w:r><w:rPr>'+(bold?'<w:b/>':'')+'<w:sz w:val="'+size+'"/><w:szCs w:val="'+size+'"/></w:rPr><w:t xml:space="preserve">'+escapeXml(text)+'</w:t></w:r></w:p>';}
  function xmlAlignment(value){return '<w:jc w:val="'+value+'"/>';}
  function escapeXml(text){return String(text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  publishGeneratedCv();
})();






