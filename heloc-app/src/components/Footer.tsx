import React from 'react';

export const Footer: React.FC = () => {
    return (
        <footer>
            <div className="footer-main">
                <div className="footer-headshot bg-gray-300"></div>
                <div className="footer-info">
                    <span className="footer-name">Barragan Mortgage Admin</span>
                    <div>NMLS #123456 | DRE #654321</div>
                    <div>(555) 123-4567 | barraganmortgage@gmail.com</div>
                    <div className="footer-stars">★★★★★ 5.0 Rating</div>
                </div>
                <img src="/placeholder-logo.png" className="company-logo-footer" alt="Logo" />
            </div>
            <div className="footer-legal">
                <span>Equal Housing Lender</span>
                <span>NMLS Consumer Access</span>
            </div>
        </footer>
    );
};
