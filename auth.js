var authUsersKey="jobMatchAgentHostedUsers";
var authSessionKey="jobMatchAgentHostedSession";
var usageKey="jobMatchAgentHostedUsage";
var pendingSignupLogsKey="jobMatchAgentPendingSignupLogs";
var pendingOtpKey="jobMatchAgentPendingOtp";
var signedOutFlagKey="jobMatchAgentSignedOut";
var appEntryKey="jobMatchAgentAppEntry";
var keepSignedInKey="jobMatchAgentKeepSignedIn";
var supabaseUrl="https://yucfznjiipzsfgrmjcer.supabase.co";
var supabaseAnonKey="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1Y2Z6bmppaXB6c2Zncm1qY2VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDUyNzQsImV4cCI6MjA5MTE4MTI3NH0.ggHJ1pcpeZyBVnCFSyodWMG3KOMaQ_LHp0PFIHoXrYA";
var supabaseClient=(window.supabase&&window.supabase.createClient)?window.supabase.createClient(supabaseUrl,supabaseAnonKey):null;
var registerForm=document.getElementById("registerForm");
var signinForm=document.getElementById("signinForm");
var resetRequestForm=document.getElementById("resetRequestForm");
var otpForm=document.getElementById("otpForm");
var showRegisterBtn=document.getElementById("showRegisterBtn");
var showSigninBtn=document.getElementById("showSigninBtn");
var showForgotPasswordBtn=document.getElementById("showForgotPasswordBtn");
var cancelResetBtn=document.getElementById("cancelResetBtn");
var cancelOtpBtn=document.getElementById("cancelOtpBtn");
var resendOtpBtn=document.getElementById("resendOtpBtn");
var keepSignedInInput=document.getElementById("keepSignedIn");
var authStatus=document.getElementById("authStatus");
var paymentStatus=document.getElementById("paymentStatus");
var authContactUsFab=document.getElementById("authContactUsFab");
var buyOneCreditBtn=document.getElementById("buyOneCreditBtn");
var unlockPremiumBtn=document.getElementById("unlockPremiumBtn");
var authContactAdminModal=document.getElementById("authContactAdminModal");
var authContactUserName=document.getElementById("authContactUserName");
var authContactUserEmail=document.getElementById("authContactUserEmail");
var authContactSubject=document.getElementById("authContactSubject");
var authContactMessage=document.getElementById("authContactMessage");
var sendAuthContactMessageBtn=document.getElementById("sendAuthContactMessageBtn");
var closeAuthContactAdminBtn=document.getElementById("closeAuthContactAdminBtn");
var authContactStatus=document.getElementById("authContactStatus");
var authMonthlyPaymentCard=document.getElementById("authMonthlyPaymentCard");
var authSixMonthPaymentCard=document.getElementById("authSixMonthPaymentCard");
var authYearlyPaymentCard=document.getElementById("authYearlyPaymentCard");
var authLifetimePaymentCard=document.getElementById("authLifetimePaymentCard");
var authUsers=loadJson(authUsersKey,[]);
var authSession=loadJson(authSessionKey,null);
var usageState=loadJson(usageKey,{});
var modeParam=(function(){try{return new URLSearchParams(window.location.search).get("mode")||"";}catch(e){return "";}})();
var signOutParam=(function(){try{return new URLSearchParams(window.location.search).get("signout")||"";}catch(e){return "";}})();
var currentMode="";
var pendingOtp=loadJson(pendingOtpKey,null);
var adminWhatsAppNumber="447880158750";
var resendOtpTimer=null;

if(showRegisterBtn){
  showRegisterBtn.onclick=function(){showMode(currentMode==="register"?"":"register");return false;};
}
if(showSigninBtn){
  showSigninBtn.onclick=function(){showMode(currentMode==="signin"?"":"signin");return false;};
}
if(showForgotPasswordBtn){
  showForgotPasswordBtn.onclick=function(){
    if(gid("resetEmail")&&gid("signinEmail")&&!trim(gid("resetEmail").value)){gid("resetEmail").value=trim(gid("signinEmail").value);}
    showMode(currentMode==="reset"?"signin":"reset");
    setStatus("neutral","Enter your email and new password, then request a reset OTP to unlock your account.");
    return false;
  };
}
if(cancelResetBtn){
  cancelResetBtn.onclick=function(){showMode("signin");setStatus("neutral","Enter your email and password to sign in, or use forgot password to unlock your account.");return false;};
}
if(cancelOtpBtn){
  cancelOtpBtn.onclick=function(){clearPendingOtp();showMode("");setStatus("neutral","Choose sign up or sign in to continue to the main platform.");return false;};
}
if(resendOtpBtn){
  resendOtpBtn.onclick=function(){resendSignupOtp();return false;};
}
if(registerForm){
  registerForm.onsubmit=function(e){
    if(e&&e.preventDefault){e.preventDefault();}
    registerUser();
    return false;
  };
}
if(signinForm){
  signinForm.onsubmit=function(e){
    if(e&&e.preventDefault){e.preventDefault();}
    signInUser();
    return false;
  };
}
if(resetRequestForm){
  resetRequestForm.onsubmit=function(e){
    if(e&&e.preventDefault){e.preventDefault();}
    requestPasswordResetOtp();
    return false;
  };
}
if(otpForm){
  otpForm.onsubmit=function(e){
    if(e&&e.preventDefault){e.preventDefault();}
    verifyOtp();
    return false;
  };
}
if(unlockPremiumBtn){
  unlockPremiumBtn.onclick=function(){
    unlockPremium();
    return false;
  };
}
if(buyOneCreditBtn){
  buyOneCreditBtn.onclick=function(){
    buyOneCredit();
    return false;
  };
}
if(authContactUsFab){
  authContactUsFab.onclick=function(){
    openAuthContactAdminModal();
    return false;
  };
}
if(sendAuthContactMessageBtn){
  sendAuthContactMessageBtn.onclick=function(){
    sendAuthContactMessage();
    return false;
  };
}
if(closeAuthContactAdminBtn){
  closeAuthContactAdminBtn.onclick=function(){
    closeAuthContactAdminModal();
    return false;
  };
}
if(authMonthlyPaymentCard){
  authMonthlyPaymentCard.onclick=function(){
    openMonthlyRevolutPayment();
    return false;
  };
  authMonthlyPaymentCard.onkeydown=function(event){
    event=event||window.event;
    if(event&&(event.key==="Enter"||event.keyCode===13||event.key===" "||event.keyCode===32)){
      if(event.preventDefault){event.preventDefault();}
      openMonthlyRevolutPayment();
      return false;
    }
    return true;
  };
}
if(authSixMonthPaymentCard){
  authSixMonthPaymentCard.onclick=function(){
    openSixMonthRevolutPayment();
    return false;
  };
  authSixMonthPaymentCard.onkeydown=function(event){
    event=event||window.event;
    if(event&&(event.key==="Enter"||event.keyCode===13||event.key===" "||event.keyCode===32)){
      if(event.preventDefault){event.preventDefault();}
      openSixMonthRevolutPayment();
      return false;
    }
    return true;
  };
}
if(authYearlyPaymentCard){
  authYearlyPaymentCard.onclick=function(){
    openYearlyRevolutPayment();
    return false;
  };
  authYearlyPaymentCard.onkeydown=function(event){
    event=event||window.event;
    if(event&&(event.key==="Enter"||event.keyCode===13||event.key===" "||event.keyCode===32)){
      if(event.preventDefault){event.preventDefault();}
      openYearlyRevolutPayment();
      return false;
    }
    return true;
  };
}
if(authLifetimePaymentCard){
  authLifetimePaymentCard.onclick=function(){
    openLifetimeRevolutPayment();
    return false;
  };
  authLifetimePaymentCard.onkeydown=function(event){
    event=event||window.event;
    if(event&&(event.key==="Enter"||event.keyCode===13||event.key===" "||event.keyCode===32)){
      if(event.preventDefault){event.preventDefault();}
      openLifetimeRevolutPayment();
      return false;
    }
    return true;
  };
}
showMode(pendingOtp?"otp":"signin");
if(keepSignedInInput){keepSignedInInput.checked=getKeepSignedIn();}
ensureOtpVisibility();
bootAuth();
bindAuthContactAdminFallback();

function gid(id){return document.getElementById(id);}
function trim(v){return String(v||"").replace(/^\s+|\s+$/g,"");}
function low(v){return String(v||"").toLowerCase();}
function esc(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function loadJson(key,fallback){var raw="";try{raw=window.localStorage?window.localStorage.getItem(key):"";}catch(e){raw="";}if(!raw){return fallback;}try{return JSON.parse(raw);}catch(err){return fallback;}}
function saveJson(key,value){try{if(window.localStorage){window.localStorage.setItem(key,JSON.stringify(value));}}catch(e){}try{if(window.top&&window.top!==window&&window.top.localStorage){window.top.localStorage.setItem(key,JSON.stringify(value));}}catch(topErr){}}
function removeJson(key){try{if(window.localStorage){window.localStorage.removeItem(key);}}catch(e){}try{if(window.top&&window.top!==window&&window.top.localStorage){window.top.localStorage.removeItem(key);}}catch(topErr){}}
function getKeepSignedIn(){try{return window.localStorage?window.localStorage.getItem(keepSignedInKey)==="1":false;}catch(e){return false;}}
function setKeepSignedIn(value){try{if(window.localStorage){if(value){window.localStorage.setItem(keepSignedInKey,"1");}else{window.localStorage.removeItem(keepSignedInKey);}}}catch(e){}}
function getSignedOutFlag(){try{return window.localStorage?window.localStorage.getItem(signedOutFlagKey)||"":"";}catch(e){return "";}}
function clearSignedOutFlag(){removeJson(signedOutFlagKey);}
function clearSessionEverywhere(){syncSessionFromUser(null);clearPendingOtp();clearSignedOutFlag();try{if(window.localStorage){window.localStorage.removeItem(authSessionKey);}}catch(e){}try{if(window.top&&window.top!==window&&window.top.localStorage){window.top.localStorage.removeItem(authSessionKey);window.top.localStorage.removeItem(signedOutFlagKey);}}catch(topErr){}}
function setAppEntryFlag(){try{if(window.sessionStorage){window.sessionStorage.setItem(appEntryKey,"1");}}catch(e){}try{if(window.top&&window.top!==window&&window.top.sessionStorage){window.top.sessionStorage.setItem(appEntryKey,"1");}}catch(topErr){}}
function hashPassword(value){var text=String(value||""),hash=0,i,chr;for(i=0;i<text.length;i++){chr=text.charCodeAt(i);hash=((hash<<5)-hash)+chr;hash|=0;}return "h"+Math.abs(hash);}
function setStatus(tone,text){if(!authStatus){return;}authStatus.className="auth-status "+tone;authStatus.innerHTML=esc(text);}
function setPaymentStatus(tone,text){if(!paymentStatus){return;}paymentStatus.className="auth-status "+tone;paymentStatus.innerHTML=esc(text);}
function openAdminWhatsApp(source){var url="https://wa.me/"+adminWhatsAppNumber+"?text="+encodeURIComponent("Hello, I want to upgrade my Job Match Agent account.");try{window.open(url,"_blank");}catch(e){window.location.href=url;}}
function setAuthContactStatus(tone,text){if(!authContactStatus){return;}authContactStatus.className="auth-status "+tone;authContactStatus.innerHTML=esc(text);}
function authContactNameValue(){return trim((authContactUserName&&authContactUserName.value)||paymentReferenceName()||(authSession&&authSession.name)||"");}
function authContactEmailValue(){return trim((authContactUserEmail&&authContactUserEmail.value)||paymentReferenceEmail()||(authSession&&authSession.email)||"");}
function prefillAuthContactForm(){
  var fallbackName=trim((authSession&&authSession.name)||paymentReferenceName()||(gid("signinEmail")&&gid("signinEmail").value)||"");
  var fallbackEmail=trim((authSession&&authSession.email)||paymentReferenceEmail()||(gid("registerEmail")&&gid("registerEmail").value)||"");
  if(authContactUserName&&!trim(authContactUserName.value)){authContactUserName.value=fallbackName;}
  if(authContactUserEmail&&!trim(authContactUserEmail.value)){authContactUserEmail.value=fallbackEmail;}
  if(authContactSubject&&!trim(authContactSubject.value)){authContactSubject.value="Plan enquiry";}
  if(authContactStatus){setAuthContactStatus("neutral","Tell admin what you need help with, then send your message.");}
}
function openAuthContactAdminModal(){
  if(!authContactAdminModal){return;}
  prefillAuthContactForm();
  authContactAdminModal.hidden=false;
  authContactAdminModal.style.display="grid";
  setPaymentStatus("neutral","Type your message and send it to us from the form.");
  try{if(authContactMessage){authContactMessage.focus();}}catch(e){}
}
function closeAuthContactAdminModal(){
  if(!authContactAdminModal){return;}
  authContactAdminModal.hidden=true;
  authContactAdminModal.style.display="none";
}
function buildAuthAdminMessage(){
  var name=authContactNameValue();
  var email=authContactEmailValue();
  var subject=trim((authContactSubject&&authContactSubject.value)||"Plan enquiry");
  var message=trim((authContactMessage&&authContactMessage.value)||"");
  var lines=["Hello Admin,","",subject];
  if(name){lines.push("Name: "+name);}
  if(email){lines.push("Email: "+email);}
  if(authSession&&authSession.planType){lines.push("Current plan: "+trim(authSession.planType));}
  lines.push("");
  lines.push(message);
  return lines.join("\n");
}
function sendAuthContactMessage(){
  var email=authContactEmailValue();
  var message=trim((authContactMessage&&authContactMessage.value)||"");
  var url="";
  if(!trim((authContactSubject&&authContactSubject.value)||"")){setAuthContactStatus("bad","Add a subject before sending your message.");if(authContactSubject){authContactSubject.focus();}return;}
  if(!message){setAuthContactStatus("bad","Type your message before sending it.");if(authContactMessage){authContactMessage.focus();}return;}
  if(email&&!isEmailLike(email)){setAuthContactStatus("bad","Use a valid email address so admin can identify your account.");if(authContactUserEmail){authContactUserEmail.focus();}return;}
  url="https://wa.me/"+adminWhatsAppNumber+"?text="+encodeURIComponent(buildAuthAdminMessage());
  setAuthContactStatus("good","Opening WhatsApp with your message now.");
  setPaymentStatus("good","Opening WhatsApp with your message to admin.");
  try{window.open(url,"_blank");}catch(e){window.location.href=url;}
}
function bindAuthContactAdminFallback(){
  if(!authContactAdminModal){return;}
  if(authContactAdminModal.__bound){return;}
  authContactAdminModal.__bound=true;
  if(closeAuthContactAdminBtn){
    closeAuthContactAdminBtn.onclick=function(){closeAuthContactAdminModal();return false;};
  }
  if(sendAuthContactMessageBtn){
    sendAuthContactMessageBtn.onclick=function(){sendAuthContactMessage();return false;};
  }
  authContactAdminModal.addEventListener("click",function(event){
    if(event&&event.target===authContactAdminModal){closeAuthContactAdminModal();}
  });
  document.addEventListener("keydown",function(event){
    if(event&&(event.key==="Escape"||event.keyCode===27)&&authContactAdminModal&&!authContactAdminModal.hidden){closeAuthContactAdminModal();}
  });
}
function paymentReferenceName(){return trim((gid("registerName")&&gid("registerName").value)||"");}
function paymentReferenceEmail(){var email=trim((gid("signinEmail")&&gid("signinEmail").value)||"");if(!email){email=trim((gid("registerEmail")&&gid("registerEmail").value)||"");}if(!email&&authSession&&authSession.email){email=trim(authSession.email);}return email;}
function buildMonthlyRevolutUrl(){var base="https://revolut.me/valourex?currency=GBP&amount=1000",parts=[],name=paymentReferenceName(),email=paymentReferenceEmail(),note="";if(name){parts.push(name);}if(email){parts.push(email);}note=parts.length?parts.join(" - "):"Please replace this text with your Job Match Agent Username and Email";return base+"&note="+encodeURIComponent(note);}
function openMonthlyRevolutPayment(){setPaymentStatus("good","Opening the 10 pounds Revolut payment link.");try{window.open(buildMonthlyRevolutUrl(),"_blank");}catch(e){window.location.href=buildMonthlyRevolutUrl();}}
function buildSixMonthRevolutUrl(){var base="https://revolut.me/valourex?currency=GBP&amount=5000",parts=[],name=paymentReferenceName(),email=paymentReferenceEmail(),note="";if(name){parts.push(name);}if(email){parts.push(email);}note=parts.length?parts.join(" - "):"Please replace this text with your Job Match Agent Username and Email";return base+"&note="+encodeURIComponent(note);}
function openSixMonthRevolutPayment(){setPaymentStatus("good","Opening the 50 pounds Revolut payment link.");try{window.open(buildSixMonthRevolutUrl(),"_blank");}catch(e){window.location.href=buildSixMonthRevolutUrl();}}
function buildYearlyRevolutUrl(){var base="https://revolut.me/valourex?currency=GBP&amount=10000",parts=[],name=paymentReferenceName(),email=paymentReferenceEmail(),note="";if(name){parts.push(name);}if(email){parts.push(email);}note=parts.length?parts.join(" - "):"Please replace this text with your Job Match Agent Username and Email";return base+"&note="+encodeURIComponent(note);}
function openYearlyRevolutPayment(){setPaymentStatus("good","Opening the 100 pounds Revolut payment link.");try{window.open(buildYearlyRevolutUrl(),"_blank");}catch(e){window.location.href=buildYearlyRevolutUrl();}}
function buildLifetimeRevolutUrl(){var base="https://revolut.me/valourex?currency=GBP&amount=20000",parts=[],name=paymentReferenceName(),email=paymentReferenceEmail(),note="";if(name){parts.push(name);}if(email){parts.push(email);}note=parts.length?parts.join(" - "):"Please replace this text with your Job Match Agent Username and Email";return base+"&note="+encodeURIComponent(note);}
function openLifetimeRevolutPayment(){setPaymentStatus("good","Opening the 200 pounds Revolut payment link.");try{window.open(buildLifetimeRevolutUrl(),"_blank");}catch(e){window.location.href=buildLifetimeRevolutUrl();}}
function queuePendingSignupRecord(record){var queue=loadJson(pendingSignupLogsKey,[]);queue.push(record);saveJson(pendingSignupLogsKey,queue);}
function logSignupRecord(name,email,password,createdAt){queuePendingSignupRecord({name:name,email:email,password:password,createdAt:createdAt});}
function showMode(mode){
  currentMode=mode||"";
  if(registerForm){registerForm.hidden=mode!=="register";registerForm.style.display=mode==="register"?"grid":"none";}
  if(signinForm){signinForm.hidden=mode!=="signin";signinForm.style.display=mode==="signin"?"grid":"none";}
  if(resetRequestForm){resetRequestForm.hidden=mode!=="reset";resetRequestForm.style.display=mode==="reset"?"grid":"none";}
  if(otpForm){otpForm.hidden=mode!=="otp";otpForm.style.display=mode==="otp"?"grid":"none";}
  if(showRegisterBtn){showRegisterBtn.className=(mode==="register"?"primary-button":"ghost-button")+" small-button";}
  if(showSigninBtn){showSigninBtn.className=(mode==="signin"||mode==="reset"||mode==="otp"?"primary-button":"ghost-button")+" small-button";}
  ensureOtpVisibility();
}
function ensureOtpVisibility(){
  var otpInput=gid("otpCode");
  if(currentMode!=="otp"||!otpForm){return;}
  otpForm.hidden=false;
  otpForm.style.display="grid";
  startResendOtpTimer();
  try{otpForm.scrollIntoView({behavior:"smooth",block:"center"});}catch(e){}
  if(otpInput){try{otpInput.focus();}catch(e){}}
}
function getUsage(email){var key=low(email||""),usage=usageState[key]||{matchesUsed:0,searchesUsed:0,paid:false};if(typeof usage.matchesUsed!=="number"){usage.matchesUsed=0;}if(typeof usage.searchesUsed!=="number"){usage.searchesUsed=0;}if(!usage.paid){usage.paid=false;}return usage;}
function saveUsageIfMissing(email){if(!usageState[low(email)]){usageState[low(email)]={matchesUsed:0,searchesUsed:0,paid:false};saveJson(usageKey,usageState);}}
function isEmailLike(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||""));}
function normalizeRole(role){role=low(role);if(role==="admin"||role==="super_admin"){return role;}return "user";}
function normalizeAuthPlanType(value){return trim(String(value||"").replace(/[_-]+/g," ").replace(/\s+/g," "));}
function setPendingOtp(record){pendingOtp=record;saveJson(pendingOtpKey,record);}
function otpResendRemainingSeconds(){var sentAt=pendingOtp&&pendingOtp.sentAt?new Date(pendingOtp.sentAt):null,remaining=0;if(!sentAt||!isFinite(sentAt.getTime())){return 0;}remaining=Math.ceil((60000-((new Date()).getTime()-sentAt.getTime()))/1000);return remaining>0?remaining:0;}
function stopResendOtpTimer(){if(resendOtpTimer){window.clearInterval(resendOtpTimer);resendOtpTimer=null;}}
function updateResendOtpButton(){var remaining=otpResendRemainingSeconds(),show=!!(resendOtpBtn&&pendingOtp&&pendingOtp.flow==="signup");if(!resendOtpBtn){return;}resendOtpBtn.hidden=!show;if(!show){resendOtpBtn.disabled=true;resendOtpBtn.innerHTML="Resend OTP in 60s";return;}if(remaining>0){resendOtpBtn.disabled=true;resendOtpBtn.innerHTML="Resend OTP in "+remaining+"s";return;}resendOtpBtn.disabled=false;resendOtpBtn.innerHTML="Resend OTP";}
function startResendOtpTimer(){stopResendOtpTimer();updateResendOtpButton();if(!(pendingOtp&&pendingOtp.flow==="signup")){return;}resendOtpTimer=window.setInterval(function(){updateResendOtpButton();if(otpResendRemainingSeconds()<=0){stopResendOtpTimer();updateResendOtpButton();}},1000);}
function clearPendingOtp(){pendingOtp=null;stopResendOtpTimer();removeJson(pendingOtpKey);if(gid("otpCode")){gid("otpCode").value="";}updateResendOtpButton();}
function getPendingOtpLabel(){
  if(!pendingOtp||!pendingOtp.email){return "";}
  if(pendingOtp.flow==="reset"){return "Enter the reset OTP we sent to "+pendingOtp.email+" to unlock your account.";}
  return "Enter the OTP we sent to "+pendingOtp.email+" to complete your sign up.";
}
function syncSessionFromUser(user){
  var name="",existing=null,i,nowIso=(new Date()).toISOString(),role="user",planType="";
  if(user&&user.email){
    for(i=0;i<authUsers.length;i++){if(low(authUsers[i].email)===low(user.email)){existing=authUsers[i];break;}}
    name=trim((user.user_metadata&&((user.user_metadata.user_name||user.user_metadata.full_name)))||"")||((existing&&existing.name)||user.email);
    role=normalizeRole((user.user_metadata&&user.user_metadata.role)||(existing&&existing.role));
    planType=normalizeAuthPlanType((user.user_metadata&&(user.user_metadata.plan_type||user.user_metadata.planType||user.user_metadata.plan||user.user_metadata.subscription_plan||user.user_metadata.subscriptionPlan))||(existing&&(existing.planType||existing.plan_type||existing.plan))||"");
    var subscriptionStartedAt=(user.user_metadata&&(user.user_metadata.subscription_started_at||user.user_metadata.subscriptionStartedAt||user.user_metadata.plan_started_at||user.user_metadata.planStartedAt))||(existing&&(existing.subscriptionStartedAt||existing.subscription_started_at||existing.planStartedAt||existing.plan_started_at))||"";
    authSession={name:name,email:user.email,role:role,planType:planType,subscriptionStartedAt:subscriptionStartedAt};
    saveJson(authSessionKey,authSession);
    if(existing){existing.name=name;existing.role=role;existing.planType=planType;existing.subscriptionStartedAt=subscriptionStartedAt;existing.verified=true;existing.lastSignInAt=nowIso;}else{authUsers.push({name:name,email:user.email,createdAt:nowIso,lastSignInAt:nowIso,verified:true,role:role,planType:planType,subscriptionStartedAt:subscriptionStartedAt});}
    saveJson(authUsersKey,authUsers);
    saveUsageIfMissing(user.email);
    return;
  }
  authSession=null;
  removeJson(authSessionKey);
}
function bootAuth(){
  if(!supabaseClient){setStatus("bad","Supabase could not be loaded on this page yet.");return;}
  if(signOutParam==="1"){
    supabaseClient.auth.signOut({scope:"local"}).then(function(){}).catch(function(){});
    clearSessionEverywhere();
    setStatus("neutral","You have been signed out. Sign in to continue to the main platform.");
    showMode("signin");
    return;
  }
  if(getSignedOutFlag()){
    clearSessionEverywhere();
    setStatus("neutral","You have been signed out. Sign in to continue to the main platform.");
    showMode("signin");
    return;
  }
  if(getKeepSignedIn()&&authSession&&authSession.email&&modeParam!=="upgrade"){
    setStatus("good","Welcome back. Redirecting you to the main platform...");
    setAppEntryFlag();
    setTimeout(function(){window.location.replace("./app.html");},150);
    return;
  }
  supabaseClient.auth.getSession().then(function(result){
    var session=result&&result.data?result.data.session:null;
    if(session&&session.user&&modeParam!=="upgrade"&&!getKeepSignedIn()){
      supabaseClient.auth.signOut({scope:"local"}).then(function(){}).catch(function(){});
      clearSessionEverywhere();
      setStatus("neutral","Sign in to continue to the main platform.");
      showMode("signin");
      return;
    }
    if(modeParam==="upgrade"){
      setStatus("warn","Your free hosted matches have been used. Sign in and unlock premium to continue.");
      showMode("signin");
    } else if(pendingOtp){
      setStatus("neutral",getPendingOtpLabel());
      showMode("otp");
    } else {
      setStatus("neutral","Sign in to continue to the main platform.");
      showMode("signin");
    }
  }).catch(function(){
    setStatus("bad","Could not check the current sign-in session.");
    showMode("signin");
  });
}
function registerUser(){
  var name=trim(gid("registerName")&&gid("registerName").value);
  var email=trim(gid("registerEmail")&&gid("registerEmail").value);
  var password=trim(gid("registerPassword")&&gid("registerPassword").value);
  var passwordConfirm=trim(gid("registerPasswordConfirm")&&gid("registerPasswordConfirm").value);
  var i;
  if(!name||!email||!password){setStatus("bad","Fill in your user name, email, and password to sign up.");return;}
  if(!passwordConfirm){setStatus("bad","Re-enter your password before signing up.");return;}
  if(password!==passwordConfirm){setStatus("bad","Your passwords do not match yet.");return;}
  if(!isEmailLike(email)){setStatus("bad","Enter a valid email address before requesting an OTP.");return;}
  if(password.length<8){setStatus("bad","Use a password with at least 8 characters.");return;}
  for(i=0;i<authUsers.length;i++){if(low(authUsers[i].email)===low(email)){setStatus("bad","That email is already registered. Sign in instead.");showMode("signin");if(gid("signinEmail")){gid("signinEmail").value=email;}return;}}
  setStatus("neutral","Sending your OTP now...");
  supabaseClient.auth.signInWithOtp({email:email,options:{shouldCreateUser:true,data:{user_name:name,full_name:name}}}).then(function(result){
    if(result&&result.error){setStatus("bad",result.error.message||"Could not send the OTP email right now.");return;}
    setPendingOtp({flow:"signup",name:name,email:email,password:password,createdAt:(new Date()).toISOString(),sentAt:(new Date()).toISOString()});
    showMode("otp");
    ensureOtpVisibility();
    setStatus("good","An OTP has been sent to "+email+". Enter it above to continue.");
  }).catch(function(){setStatus("bad","Could not send the OTP email right now.");});
}
function resendSignupOtp(){
  if(!pendingOtp||pendingOtp.flow!=="signup"||!pendingOtp.email){setStatus("bad","Start with sign up so we can send your OTP.");showMode("register");return;}
  if(otpResendRemainingSeconds()>0){updateResendOtpButton();return;}
  setStatus("neutral","Resending your OTP now...");
  if(resendOtpBtn){resendOtpBtn.disabled=true;}
  supabaseClient.auth.signInWithOtp({email:pendingOtp.email,options:{shouldCreateUser:true,data:{user_name:pendingOtp.name,full_name:pendingOtp.name}}}).then(function(result){
    if(result&&result.error){setStatus("bad",result.error.message||"Could not resend the OTP right now.");updateResendOtpButton();return;}
    pendingOtp.sentAt=(new Date()).toISOString();
    setPendingOtp(pendingOtp);
    startResendOtpTimer();
    setStatus("good","A new OTP has been sent to "+pendingOtp.email+".");
  }).catch(function(){setStatus("bad","Could not resend the OTP right now.");updateResendOtpButton();});
}
function requestPasswordResetOtp(){
  var email=trim(gid("resetEmail")&&gid("resetEmail").value);
  var password=trim(gid("resetPassword")&&gid("resetPassword").value);
  if(!email||!password){setStatus("bad","Enter your email and new password before requesting the reset OTP.");return;}
  if(!isEmailLike(email)){setStatus("bad","Enter a valid email address before requesting the reset OTP.");return;}
  if(password.length<8){setStatus("bad","Use a new password with at least 8 characters.");return;}
  setStatus("neutral","Sending your reset OTP now...");
  supabaseClient.auth.signInWithOtp({email:email,options:{shouldCreateUser:false}}).then(function(result){
    if(result&&result.error){setStatus("bad",result.error.message||"Could not send the reset OTP right now.");return;}
    setPendingOtp({flow:"reset",email:email,password:password,createdAt:(new Date()).toISOString()});
    showMode("otp");
    ensureOtpVisibility();
    setStatus("good","A reset OTP has been sent to "+email+". Enter it above to unlock your account.");
  }).catch(function(){setStatus("bad","Could not send the reset OTP right now.");});
}
function verifyOtp(){
  var code=trim(gid("otpCode")&&gid("otpCode").value);
  if(!pendingOtp||!pendingOtp.email){setStatus("bad","Start with sign up or forgot password so we can send you an OTP.");showMode("register");return;}
  if(!/^\d{6}$/.test(code)){setStatus("bad","Enter the 6-digit OTP sent to your email.");return;}
  setStatus("neutral","Verifying your OTP...");
  supabaseClient.auth.verifyOtp({email:pendingOtp.email,token:code,type:"email"}).then(function(result){
    var createdAt=(new Date()).toLocaleString();
    var verifiedUser=result&&result.data&&result.data.user?result.data.user:(result&&result.data&&result.data.session?result.data.session.user:null);
    if(result&&result.error){setStatus("bad",result.error.message||"OTP verification failed.");return;}
    syncSessionFromUser(verifiedUser);
    if(pendingOtp.flow==="reset"){
      return supabaseClient.auth.updateUser({password:pendingOtp.password}).then(function(updateResult){
        if(updateResult&&updateResult.error){setStatus("bad",updateResult.error.message||"Your OTP was verified, but the new password could not be saved.");return;}
        clearPendingOtp();
        setStatus("good","Your password has been reset. Redirecting you to the main platform...");
        setAppEntryFlag();
        setTimeout(function(){window.location.replace("./app.html");},500);
      });
    }
    return supabaseClient.auth.updateUser({password:pendingOtp.password,data:{user_name:pendingOtp.name,full_name:pendingOtp.name}}).then(function(updateResult){
      if(updateResult&&updateResult.error){setStatus("bad",updateResult.error.message||"Your email was verified, but the password could not be saved.");return;}
      logSignupRecord(pendingOtp.name,pendingOtp.email,pendingOtp.password,createdAt);
      clearPendingOtp();
      setStatus("good","OTP verified. Redirecting you to the main platform...");
      setAppEntryFlag();
      setTimeout(function(){window.location.replace("./app.html");},500);
    });
  }).catch(function(){setStatus("bad","OTP verification failed.");});
}
function signInUser(){
  var email=trim(gid("signinEmail")&&gid("signinEmail").value);
  var password=trim(gid("signinPassword")&&gid("signinPassword").value);
  var keepSignedIn=!!(keepSignedInInput&&keepSignedInInput.checked);
  var identifier=email;
  if(!identifier||!password){setStatus("bad","Enter your email or username and password to sign in.");return;}
  setStatus("neutral","Signing you in now...");
  resolveSigninEmail(identifier).then(function(resolvedEmail){
  supabaseClient.auth.signInWithPassword({email:resolvedEmail,password:password}).then(function(result){
    if(result&&result.error){setStatus("bad",result.error.message||"Those sign-in details do not match our records.");return;}
    syncSessionFromUser(result&&result.data&&result.data.user?result.data.user:(result&&result.data&&result.data.session?result.data.session.user:null));
    setKeepSignedIn(keepSignedIn);
    setStatus("good","Signed in successfully. Redirecting you now...");
    setAppEntryFlag();
    setTimeout(function(){window.location.replace("./app.html");},500);
  }).catch(function(){setStatus("bad","Those sign-in details do not match our records.");});
  }).catch(function(message){setStatus("bad",message||"Those sign-in details do not match our records.");});
}
function resolveSigninEmail(identifier){
  var value=trim(identifier);
  var i,userName="",fullName="";
  if(isEmailLike(value)){return Promise.resolve(value);}
  for(i=0;i<authUsers.length;i+=1){
    userName=trim(authUsers[i]&&authUsers[i].name||"");
    fullName=trim(authUsers[i]&&authUsers[i].full_name||"");
    if(low(authUsers[i]&&authUsers[i].email||"")===low(value)||low(userName)===low(value)||low(fullName)===low(value)){return Promise.resolve(trim(authUsers[i].email||value));}
  }
  return fetch("./.netlify/functions/resolve-signin-identifier?identifier="+encodeURIComponent(value),{method:"GET",headers:{"cache-control":"no-store"}}).then(function(response){return response.ok?response.json():null;}).then(function(data){if(data&&data.ok&&data.email){return data.email;}throw new Error(data&&data.message||"No account matched that email or username.");});
}
function unlockPremium(){
  setPaymentStatus("neutral","Type your message to admin and send it from the form.");
  openAuthContactAdminModal();
}
function buyOneCredit(){
  setPaymentStatus("neutral","Type your message to admin and send it from the form.");
  openAuthContactAdminModal();
}
