import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin

  const script = `
(function() {
  if (document.getElementById('bgu-sofia-widget')) return;

  var WIDGET_URL = '${origin}/chat-widget';
  var isOpen = false;

  // Bubble button
  var btn = document.createElement('button');
  btn.id = 'bgu-sofia-btn';
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  btn.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(37,99,235,0.4);display:flex;align-items:center;justify-content:center;transition:transform 0.2s,box-shadow 0.2s;';
  btn.addEventListener('mouseover', function(){ btn.style.transform='scale(1.08)'; btn.style.boxShadow='0 6px 20px rgba(37,99,235,0.5)'; });
  btn.addEventListener('mouseout', function(){ btn.style.transform='scale(1)'; btn.style.boxShadow='0 4px 16px rgba(37,99,235,0.4)'; });

  // Iframe container
  var container = document.createElement('div');
  container.id = 'bgu-sofia-widget';
  container.style.cssText = 'position:fixed;bottom:92px;right:24px;z-index:9998;width:370px;height:560px;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.18);display:none;border:1px solid #e5e7eb;';

  var iframe = document.createElement('iframe');
  iframe.src = WIDGET_URL;
  iframe.style.cssText = 'width:100%;height:100%;border:none;';
  iframe.allow = 'clipboard-write';
  container.appendChild(iframe);

  btn.addEventListener('click', function() {
    isOpen = !isOpen;
    container.style.display = isOpen ? 'block' : 'none';
    btn.style.background = isOpen
      ? 'linear-gradient(135deg,#dc2626,#b91c1c)'
      : 'linear-gradient(135deg,#2563eb,#1d4ed8)';
    btn.innerHTML = isOpen
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  });

  document.body.appendChild(container);
  document.body.appendChild(btn);
})();
`.trim()

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
