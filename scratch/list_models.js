const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const apiKey = 'AIzaSyCJ_xE7E4sgPljvO7Kls3xmfjLVKe_09e0';
  const genAI = new GoogleGenerativeAI(apiKey);
  
  try {
    // We can list models using the generative language API directly or via listModels if available in this SDK version
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
    const data = await response.json();
    console.log('Available Models:');
    if (data.models) {
      data.models.forEach(m => {
        console.log(`- ${m.name} (supports generateContent: ${m.supportedGenerationMethods.includes('generateContent')})`);
      });
    } else {
      console.log('No models returned. API Response:', data);
    }
  } catch (err) {
    console.error('Error listing models:', err);
  }
}

listModels();
