
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, BrainCircuit, RefreshCw, ChevronRight } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

const GeminiInsights: React.FC = () => {
  const navigate = useNavigate();
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generateInsight = async () => {
    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: "You are a senior financial analyst for a massive enterprise. Based on current trends (Revenue +12.5%, Expenses -3.2%, Profit +8.4%), provide a 3-sentence high-level strategic recommendation for the next quarter. Be professional and data-driven. Focus on liquidity management and growth scaling.",
        config: {
          temperature: 0.7
        }
      });
      setInsight(response.text || "No insights available at this time.");
    } catch (err) {
      console.error("Gemini Error:", err);
      setInsight("Unable to generate AI analysis. Please check system connectivity.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateInsight();
  }, []);

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-blue-700 text-white p-8 rounded-2xl border border-blue-500 shadow-xl shadow-blue-600/20 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
        <BrainCircuit className="w-32 h-32" />
      </div>
      
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-6">
          <div className="bg-white/20 p-2 rounded-lg backdrop-blur-md">
            <Sparkles className="w-5 h-5 text-blue-200" />
          </div>
          <h3 className="text-lg font-bold">Gemini AI Assistant</h3>
        </div>

        <div className="flex-1">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-white/10 rounded w-full"></div>
              <div className="h-4 bg-white/10 rounded w-3/4"></div>
              <div className="h-4 bg-white/10 rounded w-5/6"></div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-blue-50 font-medium italic">
              "{insight || 'Initializing analysis...'}"
            </p>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button 
            onClick={generateInsight}
            disabled={loading}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-100 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh Analysis
          </button>
          
          <button type="button" onClick={() => navigate('/app/reports/overview')} className="flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full text-xs font-bold transition-all">
            Full Forecast <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default GeminiInsights;
