# Smart Spend — Financial Optimization Web 💸

Herramienta de análisis financiero diseñada para optimizar la toma de decisiones de consumo en contextos inflacionarios. Compara de forma dinámica si es más conveniente pagar al contado con descuento o en cuotas (con o sin interés).

### 1. El Problema

En economías con alta inflación, el valor del dinero en el tiempo cambia drásticamente. Decidir entre un 20% de descuento hoy o 12 cuotas fijas no es trivial sin calcular el costo de oportunidad.

### 2. La Solución

La app realiza un cálculo de **Valor Presente Neto (VPN)** comparando el desembolso inmediato contra la inversión del capital en un fondo de bajo riesgo (como la TNA de Mercado Pago/Money Market) y ajustando las cuotas por la inflación proyectada.

### 🚀 Tecnologías

- **Frontend:** React + Tailwind CSS.
- **Visualización:** Recharts (Gráficos comparativos de poder adquisitivo).
- **Data:** Integración con APIs para obtener Inflación Mensual y TNA actualizada.
- **Deployment:** Vercel.

### 🛠️ Características Principales

- **Cálculo de conveniencia:** Determina el ahorro real exacto al finalizar el período.
- **Gráficos dinámicos:** Visualización de la erosión del valor de la cuota por inflación.
- **Proyecciones personalizables:** Permite ajustar la tasa de rendimiento esperada.

---

[Ver App](https://discount-app-two.vercel.app/)
