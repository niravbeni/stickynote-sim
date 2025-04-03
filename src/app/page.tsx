'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const Scene = dynamic(() => import('../components/Scene'), {
  ssr: false,
});

export default function Home() {
  return (
    <main className="w-screen h-screen">
      <Scene />
    </main>
  );
} 