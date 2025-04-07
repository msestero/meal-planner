import { OpenAI } from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateMealPlan(preferences) {
  const prompt = `
  Create a 7-day meal plan for someone with the following preferences and dietary restrictions:
  "${preferences}"

  Each day should include:
  - Breakfast, lunch, and dinner
  - A list of ingredients needed for each meal
  - Prefer Trader Joe's style ingredients when possible
  - No recipes needed

  Format:
  Day 1:
  - Breakfast: ...
    Ingredients: ...
  ...
  Final output should be a JSON-like structure.
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });

  return response.choices[0].message.content;
}
