FROM node:16-slim

# Install required dependencies
RUN apt-get update \
    && apt-get install -y \
    wget \
    gnupg2 \
    apt-transport-https \
    ca-certificates \
    libxss1 \
    libxtst6 \
    libglib2.0-0 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libdrm2 \
    libgbm1 \
    libasound2 \
    fonts-liberation \
    xdg-utils \
    libcups2 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libpango-1.0-0 \
    libcairo2

# Install Chrome
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Verify Chrome installation and print version
RUN google-chrome-stable --version

# Create and set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Create production package.json with puppeteer-core
RUN cat package.json | \
    jq 'del(.devDependencies) | .dependencies.puppeteer = (.dependencies.puppeteer | sub("puppeteer";"puppeteer-core"))' > package.prod.json && \
    mv package.prod.json package.json

# Install production dependencies only
RUN npm ci --only=production

# Copy project files
COPY . .

# Set environment variables
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production
ENV PORT=3000

# Create a non-root user
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /app

# Run everything after as non-root user
USER pptruser

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "index.js"] 