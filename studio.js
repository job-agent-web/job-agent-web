/* Presentation only: all account checks and generation handlers remain in the existing app. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const paths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    cv: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    letter: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
    building: '<path d="M5 21V5l9-2v18M14 9h5v12M3 21h18M8 8h3M8 12h3M8 16h3"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
    remote: '<rect x="4" y="3" width="16" height="13" rx="2"/><path d="M12 16v5M8 21h8M8 7h8M8 11h4"/>',
    score: '<path d="M4 20h16M7 16v-4M12 16V8M17 16V4"/>',
    path: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M5 7v8a4 4 0 0 0 4 4h8M11 5h8v8m-8 0 8-8"/>',
    interview: '<path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z"/><path d="M8 9h8M8 13h5"/>',
    rex: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>'
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.cv}</svg>`;
  const tools = [
    {id:'cvBuilderPanel', name:'CV studio', title:'Build a CV that opens doors.', desc:'Shape your experience into a focused, role-specific CV.', icon:'cv', n:'01', group:'Application studio'},
    {id:'coverLetterPanel', name:'Cover letters', title:'Make a stronger first impression.', desc:'Connect your experience to the role with a tailored cover letter.', icon:'letter', n:'02', group:'Application studio'},
    {id:'cvScorerPanel', name:'CV review', title:'See where your CV can improve', desc:'Review strengths, gaps and ATS alignment before you apply.', icon:'score', n:'06', group:'Application studio'},
    {id:'sponsorSearchPanel', name:'Sponsor directory', title:'Find licensed sponsors', desc:'Explore employers with Skilled Worker sponsorship licences.', icon:'building', n:'03', group:'Discover opportunities'},
    {id:'visaJobsPanel', name:'Sponsorship jobs', title:'Explore sponsored roles', desc:'Find opportunities with employers offering visa support.', icon:'globe', n:'04', group:'Discover opportunities'},
    {id:'remoteJobsPanel', name:'Remote opportunities', title:'Work beyond boundaries', desc:'Explore remote-friendly roles across job platforms.', icon:'remote', n:'05', group:'Discover opportunities'},
    {id:'careerPathPanel', name:'Career planner', title:'Plan your next chapter', desc:'Turn a career goal into practical skills and next steps.', icon:'path', n:'07', group:'Prepare & progress'},
    {id:'interviewQuestionsPanel', name:'Interview preparation', title:'Walk in prepared', desc:'Practise questions tailored to the company and role.', icon:'interview', n:'08', group:'Prepare & progress'},
    {id:'rexChatPanel', name:'Rex career coach', title:'Think it through with Rex', desc:'Get support with applications, interviews and career decisions.', icon:'rex', n:'09', group:'Prepare & progress'}
  ];
  function element(tag, cls, html) {
    const node = document.createElement(tag); node.className = cls;
    if (html) node.innerHTML = html;
    return node;
  }
  const brand = `<a class="studio-brand" href="./index.html"><span class="studio-brand-symbol">${icon('path')}</span><span>Job Match Agent<small>THE CAREER WORKSPACE</small></span></a>`;
  function setupDialogs() {
    let current = null, returnFocus = null;
    const dialogs = [...document.querySelectorAll('.limit-modal')];
    const visible = node => !node.hidden && getComputedStyle(node).display !== 'none';
    function sync() {
      const next = dialogs.find(visible) || null;
      if (next === current) return;
      if (!next) {
        current = null;
        if (returnFocus?.isConnected) returnFocus.focus();
        return;
      }
      returnFocus = document.activeElement;
      current = next;
      const card = next.querySelector('.limit-modal-card') || next;
      card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
      const heading = card.querySelector('h2, h3');
      if (heading) { heading.id ||= next.id + 'Heading'; card.setAttribute('aria-labelledby', heading.id); }
      card.tabIndex = -1;
      card.focus({preventScroll:true});
    }
    dialogs.forEach(dialog => new MutationObserver(sync).observe(dialog, {attributes:true, attributeFilter:['hidden','style','class']}));
    document.addEventListener('keydown', event => {
      if (!current || !visible(current)) return;
      const close = current.querySelector('#limitModalCloseBtn, #closeContactUsBtn, #closeAuthContactAdminBtn');
      if (event.key === 'Escape' && close) { event.preventDefault(); close.click(); return; }
      if (event.key !== 'Tab') return;
      const items = [...current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(visible).filter(n=>n.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) { event.preventDefault(); first?.focus(); }
    });
    sync();
  }
  function boot() {
    if (document.body.dataset.studioReady) return;
    setupDialogs();
    if (document.body.classList.contains('studio-auth')) {
      const intro = document.querySelector('.access-intro');
      const title = document.querySelector('.auth-title');
      const update = () => {
        const register = $('registerForm') && !$('registerForm').hidden;
        title.textContent = register ? 'Your next chapter starts here.' : 'Welcome back.';
        intro.textContent = register ? 'Create your account. Put your experience to work.' : 'Sign in and make your next move count.';
      };
      document.querySelector('.access-card').prepend(element('div', 'studio-access-brand', brand));
      $('showRegisterBtn')?.addEventListener('click', update);
      $('showSigninBtn')?.addEventListener('click', update);
      update();
      document.body.dataset.studioReady = 'true';
      return;
    }
    const admin = document.body.classList.contains('admin-page');
    if (!admin && !$('cvBuilderPanel')) return;
    const sidebar = element('aside', 'studio-sidebar', brand);
    sidebar.id = 'studioNavigation';
    sidebar.setAttribute('aria-label', admin ? 'Administration navigation' : 'Workspace navigation');
    const space = element('div', 'studio-space', `${icon(admin ? 'users' : 'grid')}<span>${admin ? 'Administration' : 'My workspace'}<small>${admin ? 'Account & platform controls' : 'Your next move, organised'}</small></span>`);
    sidebar.append(space);
    const nav = element('nav', 'studio-nav');
    let active = null;
    const label = element('span', 'studio-breadcrumb-current', admin ? 'Users & access' : 'Overview');
    const toolbar = element('header', 'studio-toolbar', `<div class="studio-toolbar-left"><button class="studio-menu-button" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="studioNavigation">${icon('menu')}</button><span class="studio-breadcrumb-root">${admin ? 'Administration' : 'Workspace'}</span><span class="studio-breadcrumb-divider">/</span></div><div class="studio-toolbar-actions"></div>`);
    toolbar.querySelector('.studio-toolbar-left').append(label);
    const backdrop = element('button', 'studio-backdrop');
    backdrop.type = 'button'; backdrop.setAttribute('aria-label', 'Close navigation');
    const mobile = window.matchMedia('(max-width:800px)');
    const toggleMenu = (open) => {
      document.body.classList.toggle('studio-nav-open', open);
      toolbar.querySelector('.studio-menu-button').setAttribute('aria-expanded', String(open));
      sidebar.inert = mobile.matches && !open;
      if(open) requestAnimationFrame(()=>sidebar.querySelector('button[aria-current], a')?.focus());
    };
    mobile.addEventListener('change', () => toggleMenu(false));
    toolbar.querySelector('.studio-menu-button').addEventListener('click', () => toggleMenu(!document.body.classList.contains('studio-nav-open')));
    backdrop.addEventListener('click', () => toggleMenu(false));
    document.addEventListener('keydown', e => {
      if(!mobile.matches || !document.body.classList.contains('studio-nav-open'))return;
      if(e.key==='Escape'){toggleMenu(false);toolbar.querySelector('.studio-menu-button').focus();}
      if(e.key==='Tab'){
        const items=[...sidebar.querySelectorAll('a, button:not(:disabled)')].filter(n=>n.getClientRects().length);
        const first=items[0],last=items[items.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    });
    const selectNav = (id) => {
      nav.querySelectorAll('button').forEach(b => { const current = b.dataset.target === id; b.classList.toggle('is-current', current); if (current) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
      toggleMenu(false);
    };
    const navButton = (name, glyph, id, action) => {
      const b = element('button', 'studio-nav-item', `${icon(glyph)}<span>${name}</span><span class="studio-nav-lock" hidden>${icon('lock')}</span>`);
      b.type = 'button'; b.dataset.target = id; b.addEventListener('click', action); nav.append(b); return b;
    };
    if (admin) {
      const formatDates = () => {
        $('adminTableBody')?.querySelectorAll('tr:not(.admin-user-action-row)').forEach(row=>{
          [2,3].forEach(index=>{
            const cell=row.children[index], raw=cell?.textContent.trim();
            if(!raw || !/^\d{4}-\d{2}-\d{2}T/.test(raw))return;
            const date=new Date(raw);if(!Number.isFinite(date.getTime()))return;
            const time=element('time','studio-date');time.dateTime=raw;time.title=raw;
            time.textContent=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(date);
            const clock=element('small','');clock.textContent=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(date);
            time.append(clock);cell.replaceChildren(time);
          });
        });
      };
      new MutationObserver(formatDates).observe($('adminTableBody'),{childList:true,subtree:true});
      formatDates();
      [['Users & access','users','adminPanel'],['Account management','settings','adminToolsPanel'],['AI routing','rex','adminAiModelPanel'],['Cover letter guidance','letter','adminGeneratorPanel']].forEach(([name,glyph,id]) => {
        navButton(name,glyph,id,() => {
          const panel = $(id); if (!panel || panel.hidden) return;
          panel.querySelector('details')?.setAttribute('open','');
          const button=panel.querySelector('.section-toggle');
          if (button && button.getAttribute('aria-expanded') !== 'true') button.click();
          selectNav(id); label.textContent=name; panel.scrollIntoView({behavior:'smooth',block:'start'});
        });
      });
      const link = element('a','studio-return',`${icon('arrow')} Open career workspace`); link.href='./app.html'; sidebar.append(link);
      const updateAccess = () => document.body.classList.toggle('studio-admin-unlocked', !$('adminPanel').hidden);
      new MutationObserver(updateAccess).observe($('adminPanel'),{attributes:true,attributeFilter:['hidden']});
      updateAccess(); selectNav('adminPanel');
    } else {
      const overview = element('section','studio-overview', `<div class="studio-page-heading"><div><p class="studio-eyebrow">MAKE YOUR NEXT MOVE</p><h1>Your career, in focus.</h1><p>A considered application starts with a clear workspace. Let\u2019s build yours.</p></div><span class="studio-heading-mark">${icon('path')}</span></div><div class="studio-section-heading"><h2>Your application studio</h2><span>Build with purpose. Apply with confidence.</span></div><div class="studio-featured-tools"></div><div class="studio-section-heading"><h2>Discover. Prepare. Progress.</h2><span>Tools for every step of your journey</span></div><div class="studio-tool-grid"></div>`);
      const hero = document.querySelector('.hero');
      hero.before(overview);
      const focusHeading=element('div','studio-focus-heading',`<button type="button" class="studio-back">${icon('arrow')} All tools</button><p class="studio-eyebrow"></p><h1></h1><p class="studio-focus-description"></p>`);
      document.querySelector('.layout').before(focusHeading);
      function showOverview() {
        active=null; document.body.classList.remove('studio-tool-mode');
        document.querySelectorAll('[data-studio-active]').forEach(p=>p.removeAttribute('data-studio-active'));
        label.textContent='Overview';selectNav('overview');window.scrollTo({top:0,behavior:'instant'});
      }
      function openTool(tool) {
        const panel=$(tool.id), body=$(tool.id+'Body');
        if (!panel || !body) return;
        const button=panel.querySelector('.section-toggle');
        if (panel.classList.contains('premium-pane-locked') || button?.classList.contains('pane-locked-toggle') || button?.disabled) {
          $('choosePlanBtn')?.click(); toggleMenu(false); return;
        }
        if (body.hidden || getComputedStyle(body).display==='none') {
          // Delegate access enforcement to the original control, never open a body directly.
          if (!button || button.disabled) { $('choosePlanBtn')?.click(); toggleMenu(false); return; }
          button.click();
        }
        requestAnimationFrame(()=>{
          if (body.hidden || getComputedStyle(body).display==='none') {
            const modal = $('limitModal');
            if (!modal || modal.hidden || getComputedStyle(modal).display === 'none') $('choosePlanBtn')?.click();
            toggleMenu(false); return;
          }
          document.querySelectorAll('[data-studio-active]').forEach(p=>p.removeAttribute('data-studio-active'));
          panel.setAttribute('data-studio-active','true');document.body.classList.add('studio-tool-mode');active=tool.id;
          label.textContent=tool.name;focusHeading.querySelector('h1').textContent=tool.name;
          focusHeading.querySelector('.studio-eyebrow').textContent=tool.group;
          focusHeading.querySelector('.studio-focus-description').textContent=tool.desc;
          selectNav(tool.id);window.scrollTo({top:0,behavior:'instant'});
        });
      }
      focusHeading.querySelector('button').addEventListener('click',showOverview);
      navButton('Overview','grid','overview',showOverview);
      let group='';
      for (const tool of tools) {
        if (tool.group!==group) { group=tool.group;nav.append(element('p','studio-nav-caption',group)); }
        navButton(tool.name,tool.icon,tool.id,()=>openTool(tool));
        const featured=tool.n==='01'||tool.n==='02';
        const card=element('button',featured?'studio-feature-card':'studio-tool-card',`<span class="studio-tool-icon">${icon(tool.icon)}</span><span class="studio-tool-number">${tool.n}</span><span class="studio-card-copy"><strong>${featured?tool.title:tool.name}</strong><span>${tool.desc}</span></span><span class="studio-card-action">${featured?(tool.n==='01'?'Create your CV':'Write a cover letter'):'Open workspace'} ${icon('arrow')}</span><span class="studio-card-lock" hidden>${icon('lock')} Plan access</span>`);
        card.type='button';card.dataset.target=tool.id;card.addEventListener('click',()=>openTool(tool));
        overview.querySelector(featured?'.studio-featured-tools':'.studio-tool-grid').append(card);
      }
      const actions=toolbar.querySelector('.studio-toolbar-actions');
      ['themeToggleBtn','choosePlanBtn'].forEach(id=>{if($(id))actions.append($(id));});
      const footer=element('div','studio-sidebar-footer',`<span class="studio-nav-caption">YOUR ACCOUNT</span>`);
      ['accountSummary','signOutBtn'].forEach(id=>{if($(id))footer.append($(id));});
      sidebar.append(footer);
      const claim=$('claimWeeklyDayWrap');
      if (claim) {
        const heading=overview.querySelector('.studio-page-heading');
        heading.querySelector('.studio-heading-mark').remove();heading.append(claim);
      }
      const balances=$('accountBalances');if(balances)footer.append(balances);
      const search=$('heroSearch');
      if(search){overview.append(search);search.querySelector('.card-label').textContent='FIND YOUR NEXT OPPORTUNITY';}
      const updateLocks=()=>{
        tools.forEach(tool=>{
          const panel=$(tool.id), button=panel?.querySelector('.section-toggle');
          const locked=!!(panel?.classList.contains('premium-pane-locked')||button?.classList.contains('pane-locked-toggle')||button?.disabled);
          document.querySelectorAll(`[data-target="${tool.id}"]`).forEach(el=>{const badge=el.querySelector('.studio-nav-lock, .studio-card-lock');if(badge && badge.hidden!==!locked)badge.hidden=!locked;});
        });
        if (active && $(active+'Body')?.hidden) showOverview();
      };
      tools.forEach(tool=>{
        const panel=$(tool.id);if(panel)new MutationObserver(updateLocks).observe(panel,{subtree:true,attributes:true,attributeFilter:['class','hidden','disabled']});
      });
      updateLocks(); selectNav('overview');
    }
    sidebar.insertBefore(nav, sidebar.children[2] || null);
    document.body.prepend(sidebar, toolbar, backdrop);
    document.body.dataset.studioReady = 'true';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
