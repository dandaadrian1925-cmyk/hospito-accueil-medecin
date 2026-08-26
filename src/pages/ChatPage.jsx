import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Send, AlertTriangle, ArrowLeft, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listenMessages, envoyerMessage, getConversations } from '../services/chatService';
import { Button } from '../components/ui/button';
import EmptyState from '../components/common/EmptyState';
import toast from 'react-hot-toast';

export default function ChatPage() {
  const { convId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // #confidentialité : le nom réel (transmis par CommandeDetailPage.jsx au
  // clic sur "Contacter", dénormalisé sur la commande) n'est connu QUE pour
  // la conversation ouverte à l'instant depuis cet écran-là — jamais persisté
  // ici, jamais utilisé pour les autres conversations de la liste.
  const nomReelActif = location.state?.nomReel;
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [avertissement, setAvertissement] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const unsub = getConversations(user.uid, setConversations);
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!convId) return;
    const unsub = listenMessages(convId, setMessages);
    return unsub;
  }, [convId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getAutreUserId = (conv) => conv?.participants?.find((id) => id !== user.uid) || '';
  const getAutreUserLabel = (conv) => {
    const id = getAutreUserId(conv);
    if (conv?.id === convId && nomReelActif) return nomReelActif;
    return id ? `User ${id.slice(0, 8).toUpperCase()}` : 'Utilisateur';
  };

  const convActive = conversations.find((c) => c.id === convId);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const msg = text.trim();
    setText('');
    try {
      const result = await envoyerMessage(convId, user.uid, msg);
      if (result.censured) {
        setAvertissement(result.avertissements);
        setTimeout(() => setAvertissement(null), 5000);
      }
    } catch (e) {
      toast.error(e.message === 'CHAT_SUSPENDU' ? 'Chat suspendu 24h suite à des tentatives répétées de contournement.' : 'Erreur envoi');
      setText(msg);
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-140px)] animate-fade-in">
      {/* Liste des conversations */}
      <div className={`md:col-span-1 glass-card-elevated overflow-hidden flex flex-col ${convId ? 'hidden md:flex' : ''}`}>
        <div className="p-4 border-b border-border">
          <h2 className="font-display font-bold text-foreground">Messages</h2>
        </div>
        <div className="overflow-y-auto flex-1">
          {conversations.length === 0 ? (
            <EmptyState title="Aucune conversation" icon={MessageCircle} />
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => navigate(`/chat/${conv.id}`)}
                className={`w-full flex items-center gap-3 p-4 border-b border-border hover:bg-secondary/60 transition-colors text-left ${conv.id === convId ? 'bg-secondary' : ''}`}
              >
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0">
                  {getAutreUserLabel(conv)[5]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{getAutreUserLabel(conv)}</p>
                  <p className="text-xs text-muted-foreground truncate">{conv.lastMessage || 'Aucun message'}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Zone de chat */}
      <div className={`md:col-span-2 glass-card-elevated overflow-hidden flex flex-col ${!convId ? 'hidden md:flex' : ''}`}>
        {convId ? (
          <>
            <div className="p-4 border-b border-border flex items-center gap-3">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => navigate('/chat')}>
                <ArrowLeft size={16} />
              </Button>
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold flex-shrink-0">
                {getAutreUserLabel(convActive)[5]}
              </div>
              <p className="font-semibold text-sm text-foreground">{getAutreUserLabel(convActive)}</p>
            </div>

            {avertissement && (
              <div className="mx-4 mt-3 p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
                <AlertTriangle size={16} className="text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-destructive">Tentative de contournement détectée ({avertissement}/4)</p>
                  <p className="text-xs text-destructive/80 mt-0.5">Les coordonnées personnelles sont censurées automatiquement.</p>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="text-center text-xs text-muted-foreground bg-secondary rounded-xl py-2 px-4 mx-auto max-w-xs">
                🔒 Chat sécurisé — les coordonnées personnelles sont censurées automatiquement
              </div>
              {messages.map((msg) => {
                const isMe = msg.senderId === user.uid;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl ${isMe ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-secondary text-secondary-foreground rounded-bl-sm'}`}>
                      <p className="text-sm leading-relaxed">{msg.message}</p>
                      <p className={`text-xs mt-1 ${isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{formatTime(msg.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Votre message… (les coordonnées personnelles sont interdites)"
                  className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={1}
                />
                <Button size="icon" onClick={send} disabled={!text.trim() || sending}>
                  <Send size={16} />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <MessageCircle size={40} className="mb-3 opacity-40" />
            <p className="font-semibold">Sélectionnez une conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}
