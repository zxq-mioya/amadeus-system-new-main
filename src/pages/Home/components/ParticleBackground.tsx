import React, { useEffect, useRef } from 'react';

const ParticleBackground: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    containerRef.current.appendChild(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: any[] = [];

    function createParticles() {
      const particlesNumber = 150;
      const particleDensity = 0.0001;
      const totalParticles = Math.floor(canvas.width * canvas.height * particleDensity);

      for (let i = 0; i < Math.max(particlesNumber, totalParticles); i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 1.5 + 0.5,
          opacity: Math.random() * 0.7 + 0.3,
          speed: Math.random() * 0.15 + 0.05,
          direction: Math.random() * Math.PI * 2,
        });
      }
    }

    function drawParticles() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((particle) => {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = `rgba(0, 255, 255, ${particle.opacity})`;
        ctx.fill();
      });
    }

    function updateParticles() {
      particles.forEach((particle) => {
        particle.x += Math.cos(particle.direction) * particle.speed;
        particle.y += Math.sin(particle.direction) * particle.speed;

        if (particle.x < 0 || particle.x > canvas.width)
          particle.direction = Math.PI - particle.direction;
        if (particle.y < 0 || particle.y > canvas.height)
          particle.direction = -particle.direction;

        if (Math.random() < 0.005)
          particle.direction += (Math.random() - 0.5) * 0.3;

        particle.opacity += (Math.random() - 0.5) * 0.01;
        particle.opacity = Math.max(0.3, Math.min(1, particle.opacity));
      });
    }

    function animate() {
      drawParticles();
      updateParticles();
      requestAnimationFrame(animate);
    }

    createParticles();
    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      particles.length = 0;
      createParticles();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100vh',
        position: 'fixed',
        overflow: 'hidden',
        backgroundColor: '#000',
        zIndex: -1,
      }}
    />
  );
};

export default ParticleBackground;
