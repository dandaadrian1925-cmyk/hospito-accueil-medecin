import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { LogIn } from 'lucide-react';
import { loginWithEmail } from '../services/authService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await loginWithEmail(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      // On ne distingue jamais "mauvais mot de passe" de "compte inexistant", mais un
      // problème réseau ou un blocage temporaire (trop de tentatives) n'a rien à voir
      // avec les identifiants — le dire clairement évite qu'un livreur ne s'acharne à
      // retaper le même mot de passe et finisse par déclencher un vrai blocage.
      const msgs = {
        'auth/too-many-requests': 'Trop de tentatives — réessayez dans quelques minutes.',
        'auth/network-request-failed': 'Problème de connexion réseau — réessayez.',
      };
      toast.error(msgs[err.code] || 'Identifiants invalides');
      // #nouveau (demande utilisateur, "partout où on demande un email et un
      // mot de passe, vider les champs après une tentative") — jamais laisser
      // un mot de passe erroné (ou celui d'un poste partagé) visible dans le
      // formulaire.
      setEmail('');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden gradient-primary">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md px-6"
      >
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl font-bold text-foreground mb-3" style={{ textShadow: '0 1px 12px hsl(0 0% 100% / 0.4)' }}>HostoConnect Accueil</h1>
          <p className="text-foreground/80 text-base max-w-sm mx-auto font-medium">
            Espace réservé au personnel d'accueil.
          </p>
        </div>

        <div className="bg-white/95 backdrop-blur rounded-2xl p-10 shadow-2xl">
          <h2 className="font-display text-2xl font-bold text-center mb-2">Connexion</h2>
          <p className="text-muted-foreground text-center mb-8 text-sm">Connectez-vous avec votre compte accueil.</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@hospito.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password" type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <Link to="/mot-de-passe-oublie" className="inline-block text-xs font-semibold text-primary hover:underline mt-1">
                Mot de passe oublié ?
              </Link>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              <LogIn size={16} />
              {submitting ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
