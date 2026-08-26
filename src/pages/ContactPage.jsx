import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send, Bot, User, Headphones, AlertTriangle, CheckCircle } from 'lucide-react';
import { collection, addDoc, doc, updateDoc, arrayUnion, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { getMesLivraisons, STATUT_LABELS } from '../services/commandesService';
import { Button } from '../components/ui/button';
import toast from 'react-hot-toast';

// Passe par une Edge Function Supabase plutôt que d'appeler Gemini directement :
// une clé référencée dans le code client (VITE_*) est lisible en clair dans le bundle.
const GEMINI_PROXY_URL = 'https://cekiqtkdgjgawxxerjdf.supabase.co/functions/v1/gemini-proxy';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Même règle des deux côtés (client et admin) : passé ce délai sans opérateur, on
// arrête d'attendre — cf. supportService.SUPPORT_EXPIRATION_MS côté admin.
const SUPPORT_EXPIRATION_MS = 2 * 60 * 60 * 1000;

const buildSystemPrompt = (userProfile, livraisons) => `
Tu es l'assistant virtuel de MAKET pour les livreurs partenaires. Tu t'appelles "Assistant MAKET".
Tu réponds uniquement en français, de manière claire, concise et professionnelle.
Tu ne réponds qu'aux questions concernant l'activité de livreur MAKET. Si la question n'est pas liée, redirige poliment vers les sujets pertinents.

=== FONCTIONNEMENT LIVREUR MAKET ===

DOSSIER LIVREUR :
- CNI (recto/verso + photo tenant la CNI) obligatoire, vérifiée par l'équipe MAKET
- Garant obligatoire (nom, téléphone, lien de parenté)
- Contrat à signer en personne au bureau MAKET
- Tant que CNI et contrat ne sont pas validés, aucune course n'est accessible

COURSES (100% en libre-service, jamais assignées par un admin) :
- Le livreur consulte la page "Opportunités" : les commandes prêtes à livrer dans SA ville (ramassage chez le vendeur, ou livraison finale inter-villes)
- Il candidate lui-même en proposant son propre prix pour les frais de livraison — aucun tarif imposé
- L'acheteur doit accepter et payer ces frais avant que le livreur ne parte (statut "prix_propose" puis "livreur_assigne")
- Ramassage : le livreur demande au VENDEUR son code à 4 chiffres pour confirmer qu'il a bien récupéré l'article (statut "en_route_collecte")
- Même ville : le livreur demande ensuite à l'ACHETEUR son code à 4 chiffres pour confirmer la remise finale
- Inter-villes (deux livreurs, un dans chaque ville) : le premier livreur dépose l'article à une agence de voyage partenaire (photo du reçu, statut "depose_agence"), le second le récupère à l'agence dans sa ville (photo, "recupere_agence") puis part en livraison finale ("en_route_livraison") et confirme avec le code de l'acheteur
- Paiement du livreur : 100% dématérialisé, JAMAIS de cash. Les frais de livraison sont crédités automatiquement dans le solde MAKET du livreur (page "Mon wallet"), environ 24h après la remise, commission MAKET déjà déduite
- Le livreur retire ses gains vers Mobile Money (MTN/Orange) depuis la page "Mon wallet", traitement sous 24h

SÉCURITÉ :
- CNI vérifiée et garant enregistré avant toute prise en charge
- Un compte suspendu perd immédiatement l'accès à l'app

OPÉRATEUR HUMAIN :
- Si le livreur demande à parler à un opérateur humain, un agent, ou un humain (notamment pour toute question sur la rémunération, un litige avec un client, ou un problème urgent), réponds :
  "Je vais vous mettre en relation avec un opérateur MAKET. Veuillez patienter, un agent va vous rejoindre sous peu. ⏳"
  Et termine ton message par exactement ce tag : [ESCALADE_OPERATEUR]

=== DONNÉES DU LIVREUR CONNECTÉ ===
${userProfile ? `
Nom : ${userProfile.displayName || 'Non renseigné'}
Téléphone : ${userProfile.telephone || 'Non renseigné'}
Ville : ${userProfile.ville || 'Non renseignée'}
CNI vérifiée : ${userProfile.cniVerifie ? 'Oui ✅' : 'Non ❌'}
Contrat signé : ${userProfile.contratSigne ? 'Oui ✅' : 'Non ❌'}
` : 'Livreur non connecté'}

${livraisons?.length > 0 ? `
LIVRAISONS ASSIGNÉES (${livraisons.length}) :
${livraisons.slice(0, 5).map(c => `- ${c.titreAnnonce || `Commande #${c.id?.slice(0, 8)}`} | Statut : ${STATUT_LABELS[c.statut] || c.statut}`).join('\n')}
` : 'Aucune livraison assignée actuellement.'}

=== INSTRUCTIONS ===
- Sois concis (3-4 phrases max sauf si on te demande plus de détails)
- Ne divulgue jamais de données personnelles dans une réponse publique
- Ne fabrique jamais d'information sur la rémunération/les montants — si on te le demande, escalade vers un opérateur
- Réponds toujours en français
`;

const callGemini = async (messages, systemPrompt) => {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const response = await fetch(GEMINI_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ systemPrompt, contents }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Erreur API Gemini');
  return data.text || 'Désolé, je n\'ai pas pu générer une réponse.';
};

function MessageBubble({ msg }) {
  const isBot = msg.role === 'assistant';
  const isOperator = msg.role === 'operator';
  const isEscalade = msg.content.includes('[ESCALADE_OPERATEUR]');
  const displayContent = msg.content.replace('[ESCALADE_OPERATEUR]', '').trim();

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-2.5 mb-3 ${(isBot || isOperator) ? 'justify-start' : 'justify-end'}`}>
      {(isBot || isOperator) && (
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${isOperator ? 'bg-success' : 'gradient-primary'}`}>
          {isOperator ? <Headphones size={15} className="text-white" /> : <Bot size={15} className="text-white" />}
        </div>
      )}

      <div className="max-w-[75%]">
        <div className={`px-3.5 py-2.5 text-sm leading-relaxed ${
          isOperator ? 'bg-success/10 text-foreground border border-success/30 rounded-tl-sm rounded-2xl'
          : isBot ? 'bg-secondary text-foreground border border-border rounded-tl-sm rounded-2xl'
          : 'bg-primary text-primary-foreground rounded-tr-sm rounded-2xl'
        }`}>
          {isOperator && <div className="text-[11px] font-bold mb-0.5 opacity-75">Opérateur MAKET</div>}
          {displayContent}
        </div>

        {isEscalade && (
          <div className="mt-2 p-3 bg-warning/10 border border-warning/30 rounded-lg flex items-center gap-2">
            <Headphones size={15} className="text-warning flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-foreground">En attente d'un opérateur</p>
              <p className="text-xs text-muted-foreground mt-0.5">Un agent MAKET va vous rejoindre sous peu (5-15 min).</p>
            </div>
          </div>
        )}

        <p className={`text-[11px] text-muted-foreground mt-1 ${(isBot || isOperator) ? 'text-left' : 'text-right'}`}>
          {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {!isBot && !isOperator && (
        <div className="w-8 h-8 rounded-lg bg-secondary border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
          <User size={15} className="text-muted-foreground" />
        </div>
      )}
    </motion.div>
  );
}

export default function ContactPage() {
  const { user, userProfile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [livraisons, setLivraisons] = useState([]);
  const [supportConvId, setSupportConvId] = useState(null);
  const [supportStatut, setSupportStatut] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    getMesLivraisons(user.uid)
      .then(setLivraisons)
      .catch((e) => console.error('Erreur chargement livraisons :', e));
  }, [user]);

  useEffect(() => {
    const welcome = userProfile
      ? `Bonjour ${userProfile.displayName?.split(' ')[0] || ''} ! 👋 Je suis l'assistant MAKET. Comment puis-je vous aider ?`
      : `Bonjour ! 👋 Je suis l'assistant MAKET. Comment puis-je vous aider ?`;
    setMessages([{ role: 'assistant', content: welcome, timestamp: Date.now() }]);
  }, [userProfile]);

  useEffect(() => {
    if (!supportConvId) return;
    const ref = doc(db, 'support_conversations', supportConvId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      let statut = data.statut;
      const createdMs = data.createdAt?.toMillis?.();
      if (statut === 'en_attente_operateur' && createdMs && Date.now() - createdMs > SUPPORT_EXPIRATION_MS) {
        statut = 'expiree';
        updateDoc(ref, { statut: 'expiree', updatedAt: serverTimestamp() }).catch((e) => console.error('Erreur expiration support :', e));
      }
      setMessages(data.messages || []);
      setSupportStatut(statut);
    });
    return unsub;
  }, [supportConvId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const systemPrompt = buildSystemPrompt(userProfile, livraisons);

  const recommencerConversation = () => {
    setSupportConvId(null);
    setSupportStatut(null);
    setMessages([{ role: 'assistant', content: 'Bonjour à nouveau ! 👋 Comment puis-je vous aider ?', timestamp: Date.now() }]);
  };

  const send = async () => {
    if (!input.trim() || loading) return;

    if (supportConvId && supportStatut !== 'resolu') {
      const userMsg = { role: 'user', content: input.trim(), timestamp: Date.now() };
      setInput('');
      try {
        await updateDoc(doc(db, 'support_conversations', supportConvId), {
          messages: arrayUnion(userMsg),
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        console.error('Erreur envoi message support :', e);
        toast.error("Impossible d'envoyer le message");
      }
      return;
    }

    const userMsg = { role: 'user', content: input.trim(), timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const history = newMessages.filter((_, i) => i > 0);
      const reply = await callGemini(history, systemPrompt);
      const botMsg = { role: 'assistant', content: reply, timestamp: Date.now() };
      setMessages((prev) => [...prev, botMsg]);

      if (reply.includes('[ESCALADE_OPERATEUR]')) {
        try {
          const ref = await addDoc(collection(db, 'support_conversations'), {
            userId: user?.uid || null,
            userEmail: user?.email || 'anonyme',
            userName: userProfile?.displayName || 'Livreur',
            source: 'livreur',
            messages: [...newMessages, botMsg].map((m) => ({
              role: m.role, content: m.content.replace('[ESCALADE_OPERATEUR]', '').trim(), timestamp: m.timestamp,
            })),
            statut: 'en_attente_operateur',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setSupportConvId(ref.id);
          setSupportStatut('en_attente_operateur');
          toast.success('Demande transmise à un opérateur !');
        } catch (e) {
          console.error('Erreur création demande support :', e);
          toast.error(`Échec de la transmission à un opérateur : ${e.code || e.message}`);
        }
      }
    } catch (e) {
      console.error('Erreur Gemini :', e);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Désolé, je rencontre une difficulté technique. Réessayez dans quelques instants.', timestamp: Date.now() }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  const suggestions = ['Comment marquer une livraison comme en route ?', 'Que faire si le client est absent ?', 'Parler à un opérateur'];

  const inputDisabled = loading || supportStatut === 'en_attente_operateur' || supportStatut === 'resolu' || supportStatut === 'expiree';
  const inputPlaceholder = supportStatut === 'en_attente_operateur' ? "En attente d'un opérateur…"
    : (supportStatut === 'resolu' || supportStatut === 'expiree') ? 'Conversation terminée' : 'Posez votre question…';

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
          <Bot size={22} className="text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">Assistant MAKET</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            <span className="text-xs text-muted-foreground">En ligne — répond instantanément</span>
          </div>
        </div>
      </div>

      <div className="glass-card-elevated overflow-hidden flex flex-col">
        <div className="h-[440px] overflow-y-auto p-4">
          {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}

          {loading && (
            <div className="flex gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0"><Bot size={15} className="text-primary-foreground" /></div>
              <div className="px-4 py-2.5 bg-secondary border border-border rounded-2xl rounded-tl-sm flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.div key={i} animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} className="w-1.5 h-1.5 bg-muted-foreground rounded-full" />
                ))}
              </div>
            </div>
          )}

          {supportStatut === 'en_cours' && (
            <div className="p-3.5 bg-success/10 border border-success/30 rounded-xl mb-3 flex gap-2.5">
              <Headphones size={17} className="text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-foreground">Un opérateur vous répond</p>
                <p className="text-xs text-muted-foreground mt-0.5">Continuez à écrire, vos messages lui arrivent directement.</p>
              </div>
            </div>
          )}

          {supportStatut === 'resolu' && (
            <div className="p-3.5 bg-secondary border border-border rounded-xl mb-3 flex items-center justify-between gap-2.5">
              <div className="flex gap-2.5">
                <CheckCircle size={17} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-foreground">Conversation terminée</p>
                  <p className="text-xs text-muted-foreground mt-0.5">L'opérateur a clôturé cette demande.</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={recommencerConversation}>Nouvelle conversation</Button>
            </div>
          )}

          {supportStatut === 'expiree' && (
            <div className="p-3.5 bg-destructive/10 border border-destructive/30 rounded-xl mb-3 flex items-center justify-between gap-2.5">
              <div className="flex gap-2.5">
                <AlertTriangle size={17} className="text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-foreground">Demande expirée</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Aucun opérateur n'a répondu sous 2h. Réessayez.</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={recommencerConversation}>Nouvelle conversation</Button>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {messages.length <= 1 && !loading && !supportConvId && (
          <div className="px-4 pb-3 flex gap-1.5 flex-wrap">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => { setInput(s); inputRef.current?.focus(); }} className="px-3 py-1.5 bg-secondary border border-border rounded-full text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="p-3 border-t border-border flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={inputDisabled}
            placeholder={inputPlaceholder}
            rows={1}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px] max-h-[120px]"
          />
          <Button size="icon" onClick={send} disabled={!input.trim() || inputDisabled}>
            <Send size={16} />
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 bg-secondary rounded-lg border border-border">
        <AlertTriangle size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Pour les urgences ou problèmes complexes, tapez <strong>"parler à un opérateur"</strong> pour être mis en relation avec un agent humain.
        </p>
      </div>
    </div>
  );
}
