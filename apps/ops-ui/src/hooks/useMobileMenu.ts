'use client';

import { useEffect } from 'react';

export function useMobileMenu() {
  const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    const handleResize = () => {
      if (!isMobile()) {
        document.body.style.overflow = '';
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const closeMenu = () => {
    document.body.style.overflow = '';
  };

  const openMenu = () => {
    document.body.style.overflow = 'hidden';
  };

  return { isMobile, closeMenu, openMenu };
}