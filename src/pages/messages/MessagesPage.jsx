import { useEffect, useState, useRef } from 'react';
import { Send } from 'lucide-react';
import { getStaffContacts } from '../../services/personnelService';
import { getOrCreateConversationInterne, envoyerMessageInterne, listenMessagesInternes } from '../../services/internalChatService';
import { useAuth } from '../../context/AuthContext';
import Loader from '../../components/common/Loader';
import { Button } from '../../components/ui/button';

export default function MessagesPage() {
  const { user, etablissementId } = useAuth();
  const [contacts, setContacts] = useState(null);
  const [selected, setSelected] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { if (etablissementId) getStaffContacts(etablissementId).then(setContacts); }, [etablissementId]);

  useEffect(() => {
    if (!selected) return;
    setMessages([]);
    let unsub;
    getOrCreateConversationInterne(user.uid, selected.id).then((id) => {
      setConversationId(id);
      unsub = listenMessagesInternes(id, setMessages);
    });
    return () => unsub?.();
  }, [selected, user.uid]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!text.trim() || !conversationId || sending) return;
    setSending(true);
    const msg = text.trim();
    setText('');
    try {
      await envoyerMessageInterne(conversationId, user.uid, msg);
    } finally {
      setSending(false);
    }
  };

  if (contacts === null) return <Loader />;

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Messages</h1>
        <p className="text-muted-foreground mt-1">Discutez directement avec un membre du personnel.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-220px)]">
        <div className="glass-card-elevated overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border font-display font-semibold text-foreground text-sm">Personnel</div>
          <div className="overflow-y-auto flex-1">
            {contacts.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Aucun contact disponible.</p>
            ) : contacts.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/60 transition-colors ${selected?.id === c.id ? 'bg-secondary' : ''}`}
              >
                <p className="text-sm font-semibold text-foreground">{c.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{c.email}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card-elevated md:col-span-2 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Sélectionnez un contact pour discuter
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-border font-display font-semibold text-foreground text-sm">
                {selected.displayName}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.senderId === user.uid ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs px-3.5 py-2 rounded-2xl text-sm ${m.senderId === user.uid ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-secondary text-secondary-foreground rounded-bl-sm'}`}>
                      {m.message}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <div className="p-3 border-t border-border flex gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                  placeholder="Votre message…"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button size="icon" onClick={send} disabled={sending || !text.trim()}>
                  <Send size={16} />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
