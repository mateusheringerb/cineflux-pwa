const APP_CONFIG = {
  // Identidade do Aplicativo
  appName: "CINEFLUX",
  appTagline: "TV ao Vivo • Filmes • Séries",
  
  // Logo: cole a URL de uma imagem PNG/SVG transparente OU deixe vazio ("") para usar o ícone + texto
  logoUrl: "", 
  logoSymbol: "▶",

  // Tema Escuro (Cores principais)
  primaryColor: "#e50914",      // Destaque principal (botões, barra de progresso)
  primaryHover: "#ff1e29",      // Destaque ao passar o mouse / focar na TV
  backgroundColor: "#09090d",   // Fundo principal
  surfaceColor: "#14141c",      // Fundo dos cards e modais
  textColor: "#f5f5f7",         // Texto principal

  // Proxy CORS / HTTPS (Opcional)
  // Se hospedar o PWA em HTTPS (GitHub Pages/Vercel) e sua lista IPTV for HTTP,
  // cole aqui a URL do seu proxy (ex: "https://seu-worker.workers.dev/?url=")
  corsProxy: "",

  // Performance: quantidade de itens carregados por vez nas grades (ideal para celular)
  batchSize: 60
};
