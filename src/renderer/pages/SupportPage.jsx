import React from 'react';
import { Heart, MessageCircle, ExternalLink, DollarSign } from 'lucide-react';

export default function SupportPage() {
  const handleOpenLink = (url) => {
    window.api.shell.openExternal(url);
  };

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div className="page-header__content">
          <h1 className="page-header__title">
            <Heart className="page-header__icon" style={{ color: 'var(--danger)' }} />
            Support the Project
          </h1>
          <p className="page-header__subtitle">
            If you enjoy using the FS25 MT Mod Manager, please consider supporting my work!
          </p>
        </div>
      </div>

      <div className="support-layout">
        <div className="support-grid">
          {/* Discord Card */}
          <div className="support-card animate-slide-down" style={{ animationDelay: '0.1s' }}>
            <div className="support-card__icon support-card__icon--discord">
              <MessageCircle size={32} />
            </div>
            <div className="support-card__body">
              <h2 className="support-card__title">Join the Discord</h2>
              <p className="support-card__text">
                Join the community for updates, feedback, and support. Share your ideas and help me improve the manager!
              </p>
              <button 
                className="btn btn--primary btn--full"
                onClick={() => handleOpenLink('https://discord.gg/qtXMRjFdAf')}
              >
                <MessageCircle size={18} /> Join Official Discord
              </button>
            </div>
          </div>

          {/* Donation Card */}
          <div className="support-card animate-slide-down" style={{ animationDelay: '0.2s' }}>
            <div className="support-card__icon support-card__icon--paypal">
              <DollarSign size={32} />
            </div>
            <div className="support-card__body">
              <h2 className="support-card__title">Donate via PayPal</h2>
              <p className="support-card__text">
                Support the development costs and future updates. Any contribution is greatly appreciated and helps keep the project alive!
              </p>
              <button 
                className="btn btn--primary btn--full"
                style={{ background: '#0070ba', color: 'white' }}
                onClick={() => handleOpenLink('https://www.paypal.com/donate/?hosted_button_id=WN8JGCLCF8VDY')}
              >
                <DollarSign size={18} /> Support via PayPal
              </button>
            </div>
          </div>
        </div>

        <div className="support-thanks animate-fade-in" style={{ animationDelay: '0.4s' }}>
          <div className="support-thanks__content">
            <Heart size={48} fill="var(--danger)" />
            <h2>Thank You!</h2>
            <p>Every bit of support helps me dedicate more time to making this the best Mod Manager for FS25.</p>
            <p className="author-name">- Mark Thor</p>
          </div>
        </div>
      </div>
    </div>
  );
}
