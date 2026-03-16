#!/usr/bin/env python3
import re

with open('client-quote.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Simple replacement - just add the function before the ezraTourSlides declaration
old_declaration = "var ezraTourSlides = ["

new_code = """function getEzraTourSlides() {
                var isSpanish = window._ezraLanguage === 'es';
                if (isSpanish) {
                    return [
                        { title: "Bienvenido a Su Cotizacion de HELOC", content: "<div style='text-align: center; padding: 20px 0;'><span style='font-size: 48px; display: block; margin-bottom: 16px;'>&#128176;</span><p style='font-size: 16px; color: #e2e8f0; line-height: 1.6; margin-bottom: 16px;'><strong style='color: #c5a059;'>Esta es su cotizacion personalizada de HELOC.</strong> Muestra exactamente lo que recibiria.</p><p style='color: #94a3b8; font-size: 14px;'>Le voy a explicar cada seccion. Sin sorpresas. Vamos.</p></div>", highlight: null },
                        { title: "Su Monto y Pago", content: "<div style='padding: 16px 0;'><p style='font-size: 14px; color: #e2e8f0; margin-bottom: 16px;'><strong style='color: #c5a059; font-size: 18px;'>$278,810</strong> es lo que recibiria en efectivo. <strong style='color: #c5a059; font-size: 18px;'>$1,879/mes</strong> es su pago fijo.</p><p style='color: #94a3b8; font-size: 14px;'>Este pago esta asegurado. No cambiara.</p></div>", highlight: '#sec-recommendation' },
                        { title: "La Tarifa de Originacion", content: "<div style='padding: 16px 0;'><p style='font-size: 14px; color: #e2e8f0; margin-bottom: 16px;'>Mostramos <strong style='color: #c5a059;'>tres opciones: 1.50%, 2.99%, y 4.99%.</strong></p><p style='color: #94a3b8; font-size: 14px;'>Tarifa mas alta = Tasa mas baja. Usted elige.</p></div>", highlight: '#originationFeeTiers' },
                        { title: "Su Decision", content: "<div style='padding: 16px 0;'><p style='font-size: 14px; color: #e2e8f0; font-weight: 600; margin-bottom: 16px;'>Tiene tres opciones:</p><div style='background: rgba(16, 185, 129, 0.15); padding: 12px; border-radius: 6px; border-left: 4px solid #10b981; margin-bottom: 12px;'><p style='color: #e2e8f0; font-weight: 600; margin: 0 0 4px 0; font-size: 13px;'>1. Avanzar</p><p style='color: #94a3b8; margin: 0; font-size: 13px;'>Solicitud rapida de 5 minutos</p></div><div style='background: rgba(59, 130, 246, 0.15); padding: 12px; border-radius: 6px; border-left: 4px solid #3b82f6; margin-bottom: 12px;'><p style='color: #e2e8f0; font-weight: 600; margin: 0 0 4px 0; font-size: 13px;'>2. Hacer Preguntas</p><p style='color: #94a3b8; margin: 0; font-size: 13px;'>Converse conmigo</p></div><div style='background: rgba(255,255,255,0.08); padding: 12px; border-radius: 6px; border-left: 4px solid #64748b;'><p style='color: #e2e8f0; font-weight: 600; margin: 0 0 4px 0; font-size: 13px;'>3. Tomar Su Tiempo</p><p style='color: #94a3b8; margin: 0; font-size: 13px;'>Guarde esta cotizacion</p></div></div>", highlight: null }
                    ];
                }
                return [
                    { title: "Welcome to Your HELOC Quote", content: "<div style='text-align: center; padding: 20px 0;'><span style='font-size: 48px; display: block; margin-bottom: 16px;'>&#128176;</span><p style='font-size: 16px; color: #e2e8f0; line-height: 1.6; margin-bottom: 16px;'><strong style='color: #c5a059;'>This is your personalized HELOC quote.</strong> It shows exactly what you'd get.</p><p style='color: #94a3b8; font-size: 14px;'>I'm going to walk you through each section. No surprises. Let's go.</p></div>", highlight: null },
                    { title: "Your Amount & Payment", content: "<div style='padding: 16px 0;'><p style='font-size: 14px; color: #e2e8f0; margin-bottom: 16px;'><strong style='color: #c5a059; font-size: 18px;'>$278,810</strong> is what you'd walk away with in cash. <strong style='color: #c5a059; font-size: 18px;'>$1,879/month</strong> is your fixed payment.</p><p style='color: #94a3b8; font-size: 14px;'>This payment is locked in. It won't change.</p></div>", highlight: '#sec-recommendation' },
                    { title: "The Origination Fee", content: "<div style='padding: 16px 0;'><p style='font-size: 14px; color: #e2e8f0; margin-bottom: 16px;'>We show <strong style='color: #c5a059;'>three options: 1.50%, 2.99%, and 4.99%.</strong></p><p style='color: #94a3b8; font-size: 14px;'>Higher fee = Lower rate. You pick.</p></div>", highlight: '#originationFeeTiers' },
                    { title: "Your Decision", content: "<div style='padding: 16px 0;'><p style='font-size: 14px; color: #e2e8f0; font-weight: 600; margin-bottom: 16px;'>You have three options:</p><div style='background: rgba(16, 185, 129, 0.15); padding: 12px; border-radius: 6px; border-left: 4px solid #10b981; margin-bottom: 12px;'><p style='color: #e2e8f0; font-weight: 600; margin: 0 0 4px 0; font-size: 13px;'>1. Move Forward</p><p style='color: #94a3b8; margin: 0; font-size: 13px;'>Quick 5-minute application</p></div><div style='background: rgba(59, 130, 246, 0.15); padding: 12px; border-radius: 6px; border-left: 4px solid #3b82f6; margin-bottom: 12px;'><p style='color: #e2e8f0; font-weight: 600; margin: 0 0 4px 0; font-size: 13px;'>2. Ask Questions</p><p style='color: #94a3b8; margin: 0; font-size: 13px;'>Chat with me</p></div><div style='background: rgba(255,255,255,0.08); padding: 12px; border-radius: 6px; border-left: 4px solid #64748b;'><p style='color: #e2e8f0; font-weight: 600; margin: 0 0 4px 0; font-size: 13px;'>3. Take Your Time</p><p style='color: #94a3b8; margin: 0; font-size: 13px;'>Save this quote</p></div></div>", highlight: null }
                ];
            }
            
            var ezraTourSlides = getEzraTourSlides();"""

if old_declaration in content:
    # Find and replace the entire ezraTourSlides array
    pattern = r'var ezraTourSlides = \[[\s\S]*?\];'
    if re.search(pattern, content):
        content = re.sub(pattern, new_code, content)
        with open('client-quote.html', 'w', encoding='utf-8') as f:
            f.write(content)
        print('Replacement successful!')
    else:
        print('Pattern not found with regex')
else:
    print('Old declaration not found')
