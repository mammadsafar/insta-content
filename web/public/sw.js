// Private API and media are deliberately never stored by this worker.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{if(!event.data)return;const data=event.data.json();event.waitUntil(self.registration.showNotification(data.title||'روز',{body:data.body||'',icon:'/icon.svg',data:{url:data.url||'/'},tag:data.tag||data.type}));});
self.addEventListener('notificationclick',event=>{event.notification.close();const raw=event.notification.data?.url||'/';const url=new URL(raw,self.location.origin);if(url.origin!==self.location.origin)return;event.waitUntil(self.clients.openWindow(url.href));});
