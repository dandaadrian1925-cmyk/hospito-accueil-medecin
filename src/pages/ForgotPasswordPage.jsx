import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { resetPassword } from '../services/authService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      // Ne jamais distinguer "compte inexistant" des autres erreurs, sinon cet
      // écran devient un moyen de vérifier quels emails ont un compte livreur —
      // même logique anti-énumération que maket-client.
      if (err.code === 'auth/user-not-found') {
        setSent(true);
        return;
      }
      const msgs = {
        'auth/invalid-email': 'Email invalide',
        'auth/too-many-requests': 'Trop de tentatives — réessayez dans quelques minutes',
      };
      toast.error(msgs[err.code] || "Erreur lors de l'envoi de l'email");
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
          <h1 className="font-display text-4xl font-bold text-foreground mb-3" style={{ textShadow: '0 1px 12px hsl(0 0% 100% / 0.4)' }}>Hospito Accueil</h1>
          <p className="text-foreground/80 text-base max-w-sm mx-auto font-medium">
            Espace réservé au personnel d'accueil.
          </p>
        </div>

        <div className="bg-white/95 backdrop-blur rounded-2xl p-10 shadow-2xl">
          <Link to="/login" className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm font-semibold mb-6 transition-colors">
            <ArrowLeft size={16} /> Retour à la connexion
          </Link>

          {sent ? (
            <div className="text-center py-2">
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="font-display text-xl font-bold mb-2">Email envoyé !</h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                Si un compte accueil existe pour <strong className="text-foreground">{email}</strong>, un lien de réinitialisation vient d'être envoyé. Vérifiez aussi vos spams.
              </p>
              <Button asChild className="w-full">
                <Link to="/login">Retour à la connexion</Link>
              </Button>
            </div>
          ) : (
            <>
              <h2 className="font-display text-2xl font-bold text-center mb-2">Mot de passe oublié</h2>
              <p className="text-muted-foreground text-center mb-8 text-sm">Entrez votre email, on vous envoie un lien pour le réinitialiser.</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email" type="email" required autoFocus value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="prenom.nom@hospito.com"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  <Mail size={16} />
                  {submitting ? 'Envoi…' : 'Envoyer le lien de réinitialisation'}
                </Button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
