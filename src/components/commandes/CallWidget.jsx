import { useState, useEffect, useRef } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { Phone, PhoneOff, Mic, MicOff, PhoneIncoming } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAgoraToken, demarrerAppel, terminerAppel } from '../../services/callService';
import { Button } from '../ui/button';

// #nouveau (demande utilisateur, "appels livreur-livreur pour l'inter-ville
// et client-livreur uniquement pour le moment") : le flux audio passe
// entièrement par Agora (WebRTC géré par leur SDK, aucun serveur TURN à
// notre charge) — ce composant ne fait que piloter le SDK et refléter le
// signal de présence d'appel (commande.appelEnCours, déjà inclus dans
// listenCommande côté page appelante, jamais un listener séparé ici).
export default function CallWidget({ commandeId, contexte, appelEnCours, currentUid, label = 'Appeler' }) {
  const [statut, setStatut] = useState('idle'); // idle | connecting | active
  const [muted, setMuted] = useState(false);
  const clientRef = useRef(null);
  const localTrackRef = useRef(null);

  const estAppelPourMoi = appelEnCours?.contexte === contexte;
  const jeSuisAppelant = estAppelPourMoi && appelEnCours.callerId === currentUid;
  const audioCtxRef = useRef(null);
  const sonnerieIntervalRef = useRef(null);

  // #nouveau (demande utilisateur, "aucune sonnerie ce n'est pas normal") :
  // deux bips générés via Web Audio API (aucun fichier audio à héberger),
  // répétés toutes les 2s tant que l'appel entrant n'est ni répondu ni
  // refusé.
  const jouerBip = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = audioCtxRef.current || (audioCtxRef.current = new Ctx());
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      [0, 500].forEach(delai => setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      }, delai));
    } catch { /* audio non disponible, sans conséquence — le bandeau visuel suffit */ }
  };

  useEffect(() => {
    const sonnerieActive = estAppelPourMoi && !jeSuisAppelant && statut === 'idle';
    if (sonnerieActive) {
      jouerBip();
      sonnerieIntervalRef.current = setInterval(jouerBip, 2000);
    } else if (sonnerieIntervalRef.current) {
      clearInterval(sonnerieIntervalRef.current);
      sonnerieIntervalRef.current = null;
    }
    return () => {
      if (sonnerieIntervalRef.current) { clearInterval(sonnerieIntervalRef.current); sonnerieIntervalRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estAppelPourMoi, jeSuisAppelant, statut]);

  const quitter = async (raccrocherPourTous) => {
    try {
      localTrackRef.current?.stop();
      localTrackRef.current?.close();
      await clientRef.current?.leave();
    } catch { /* déjà déconnecté, sans importance */ }
    clientRef.current = null;
    localTrackRef.current = null;
    setStatut('idle');
    setMuted(false);
    if (raccrocherPourTous) {
      terminerAppel(commandeId).catch(() => {});
    }
  };

  const rejoindre = async () => {
    setStatut('connecting');
    try {
      const { appId, channelName, token, uid } = await getAgoraToken(commandeId, contexte);
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;
      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === 'audio') user.audioTrack?.play();
      });
      await client.join(appId, channelName, token, uid);
      const localTrack = await AgoraRTC.createMicrophoneAudioTrack();
      localTrackRef.current = localTrack;
      await client.publish([localTrack]);
      setStatut('active');
    } catch (e) {
      toast.error("Impossible de rejoindre l'appel — vérifiez l'autorisation du micro dans votre navigateur.");
      setStatut('idle');
    }
  };

  const appeler = async () => {
    setStatut('connecting');
    try {
      await demarrerAppel(commandeId, contexte);
      await rejoindre();
    } catch (e) {
      toast.error(e.message || "Impossible de démarrer l'appel");
      setStatut('idle');
    }
  };

  useEffect(() => {
    if (!estAppelPourMoi && statut !== 'idle') quitter(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estAppelPourMoi]);

  useEffect(() => () => { quitter(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = () => {
    localTrackRef.current?.setEnabled(muted);
    setMuted(!muted);
  };

  if (!estAppelPourMoi) {
    return (
      <Button variant="outline" className="w-full" disabled={statut === 'connecting'} onClick={appeler}>
        <Phone size={16} /> {statut === 'connecting' ? 'Appel…' : label}
      </Button>
    );
  }

  if (statut === 'idle' && !jeSuisAppelant) {
    return (
      <div className="glass-card-elevated p-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <PhoneIncoming size={16} className="flex-shrink-0" /> Appel entrant…
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => quitter(true)}>Refuser</Button>
          <Button size="sm" onClick={rejoindre}>Répondre</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card-elevated p-4 flex items-center justify-between gap-3">
      <p className="text-sm font-semibold text-foreground">{statut === 'connecting' ? 'Connexion…' : 'Appel en cours'}</p>
      <div className="flex gap-2 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={toggleMute} title={muted ? 'Réactiver le micro' : 'Couper le micro'}>
          {muted ? <MicOff size={16} /> : <Mic size={16} />}
        </Button>
        <Button variant="destructive" size="sm" onClick={() => quitter(true)} title="Raccrocher">
          <PhoneOff size={16} />
        </Button>
      </div>
    </div>
  );
}
