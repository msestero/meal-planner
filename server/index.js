// server/index.js
import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
import { OpenAI } from "openai";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json()); // needed for POST JSON body

const PORT = 3001;

// GPT setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- GOOGLE PLACES ---
app.get("/api/places", async (req, res) => {
  const { lat, lng } = req.query;
  const apiKey = process.env.GOOGLE_API_KEY;

  try {
    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
      {
        params: {
          location: `${lat},${lng}`,
          radius: 5000,
          type: "grocery_or_supermarket",
          key: apiKey,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("Error fetching from Google Places API:", error);
    res.status(500).json({ error: "Failed to fetch places" });
  }
});

app.post("/api/mealplan/filter-products", async (req, res) => {
    const { preferences, products } = req.body;
    if (!preferences || !Array.isArray(products)) {
      return res.status(400).json({ error: "Missing preferences or products list" });
    }
  
    const productList = products
      .map((p, i) => `${i + 1}. ${p.name} - ${p.sales_size || "N/A"}${p.item_description ? ` (${p.item_description})` : ""}`)
      .join("\n");
  
    console.log(products);
    const prompt = `
  User preferences: "${preferences}"
  
  Here is a list of grocery products:
  
  ${productList}
  
  Return a JSON array of product objects that match the preferences.
  Each object must include:
  - name (must exactly match a name in the list)
  - quantity (number of times it should be purchased for the week's meals)
  
  Example:
  [
    { "name": "Tofu", "quantity": 2 },
    { "name": "Coconut Yogurt", "quantity": 1 }
  ]
  
  Check the prices and the quantity of each to plan for the week. Make sure it is not too expensive, but the person has enough food.
  
  ONLY return the array.
  `;
  
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
      });
  
      console.log("🧠 GPT raw response:", completion.choices[0].message.content);
  
      const filteredResponse = JSON.parse(completion.choices[0].message.content);
  
      if (!Array.isArray(filteredResponse)) {
        throw new Error("GPT did not return a valid array");
      }
  
      const filteredProducts = filteredResponse
        .map(({ name, quantity }) => {
          const matched = products.find((p) => p.name === name);
          if (matched) {
            return { ...matched, quantity };
          }
          return null;
        })
        .filter(Boolean);
  
      console.log("✅ Matched products with quantities:", filteredProducts.length);
  
      res.json({ filtered: filteredProducts });
    } catch (err) {
      console.error("GPT filtering error:", err);
      res.status(500).json({ error: "Failed to filter products", details: err.message });
    }
  });
  
  
  

// --- TRADER JOE'S PRODUCT SEARCH ---
app.get("/api/traderjoes", async (req, res) => {
  const { search = "food", storeCode = "130" } = req.query;

  console.log(`[TraderJoe's] Searching: "${search}" (store ${storeCode})`);

  const query = {
    operationName: "SearchProducts",
    variables: {
      storeCode,
      availability: "1",
      published: "1",
      search,
      currentPage: 0,
      pageSize: 15,
    },
    query: `
      query SearchProducts($search: String, $pageSize: Int, $currentPage: Int, $storeCode: String = "130", $availability: String = "1", $published: String = "1") {
        products(
          search: $search
          filter: {
            store_code: { eq: $storeCode }
            published: { eq: $published }
            availability: { match: $availability }
          }
          pageSize: $pageSize
          currentPage: $currentPage
        ) {
          items {
            name
            item_description
            primary_image
            retail_price
            sales_size
            sales_uom_description
          }
        }
      }
    `,
  };

  try {
    const response = await axios.post(
      "https://www.traderjoes.com/api/graphql",
      query,
      {
        headers: {
          "Content-Type": "application/json",
          Origin: "https://www.traderjoes.com",
          Referer: "https://www.traderjoes.com/",
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0",
        },
      }
    );

    const items = response.data.data?.products?.items || [];
    console.log(`[TraderJoe's] Received ${items.length} items.`);
    res.json(items);
  } catch (err) {
    console.error("[TraderJoe's] Request failed:", err.response?.data || err.message);
    res.status(500).json({ error: "Trader Joe's fetch failed", details: err.message });
  }
});

// --- BASIC GPT MEAL PLAN GENERATION ---
app.get("/api/mealplan", async (req, res) => {
  const { preferences } = req.query;
  if (!preferences) {
    return res.status(400).json({ error: "Missing 'preferences' parameter" });
  }

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

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    res.json({ mealPlan: response.choices[0].message.content });
  } catch (err) {
    console.error("GPT API error:", err);
    res.status(500).json({ error: "Failed to generate meal plan" });
  }
});

// --- SMART GPT + TRADER JOE'S MEAL PLANNER FLOW ---
app.get("/api/mealplan/from-tj", async (req, res) => {
    const { preferences } = req.query;
    if (!preferences) {
      return res.status(400).json({ error: "Missing 'preferences'" });
    }
  
    try {
      // STEP 1: Let GPT decide what ingredients to search
      const searchTermPrompt = `
  You are helping a user plan a grocery trip based on their dietary needs.
  
  Preferences: "${preferences}"
  
  Return a JSON array of ingredients or grocery items they should search for. 
  ONLY return the array. Example: ["tempeh", "quinoa", "avocados", "tofu", "spinach"]
  `;
      const ingredientResp = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: searchTermPrompt }],
        temperature: 0.7,
      });
  
      const ingredients = JSON.parse(ingredientResp.choices[0].message.content);
      console.log("GPT Ingredient Search Terms:", ingredients);
  
      // STEP 2: Query Trader Joe’s API for matching products
      const productResults = [];
      for (const item of ingredients) {
        const response = await axios.get("http://localhost:3001/api/traderjoes", {
          params: { search: item },
        });
  
        if (Array.isArray(response.data)) {
          productResults.push(
            ...response.data.map((p) => ({ ...p, matchedTerm: item }))
          );
        }
      }
  
      // STEP 3: Ask GPT to filter the product list based on preferences
      const productList = productResults
        .map((p, i) => `${i + 1}. ${p.name} - ${p.sales_size || "N/A"}${p.item_description ? ` (${p.item_description})` : ""}`)
        .join("\n");
  
      const filterPrompt = `
  User preferences: "${preferences}"
  
  Here is a list of grocery products:
  
  ${productList}
  
  Return a JSON array of product objects that match the preferences.
  Each object must include:
  - name (must exactly match a name in the list)
  - quantity (number of times it should be purchased for the week's meals)
  
  Example:
  [
    { "name": "Tofu", "quantity": 2 },
    { "name": "Coconut Yogurt", "quantity": 1 }
  ]
  
  ONLY return the array.
  `;
  
      const filterResp = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: filterPrompt }],
        temperature: 0.5,
      });
  
      const filteredNames = JSON.parse(filterResp.choices[0].message.content);
      console.log("✅ Filtered product names from GPT:", filteredNames);
  
      const filteredProducts = filteredNames
        .map(({ name, quantity }) => {
          const matched = productResults.find((p) =>
            p.name.toLowerCase().includes(name.toLowerCase())
          );
          if (matched) {
            return { ...matched, quantity };
          }
          return null;
        })
        .filter(Boolean);
  
      console.log(`🧃 Final filtered product count: ${filteredProducts.length}`);
  
      // STEP 4: Ask GPT to generate a meal plan based on ONLY those filtered products
      const filteredProductList = filteredProducts
        .map((p) => `- ${p.name} (${p.sales_size || "N/A"})`)
        .join("\n");
  
      const mealPlanPrompt = `
  You are a meal planning assistant.
  
  User preferences: "${preferences}"
  
  Available products at Trader Joe's this week:
  ${filteredProductList}
  
  Using ONLY these products, create a 7-day meal plan with breakfast, lunch, and dinner each day. 
  Each meal should name the product(s) used. Keep it simple and realistic. No recipes needed.
  `;
  
      const planResp = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: mealPlanPrompt }],
        temperature: 0.7,
      });
  
      const plan = planResp.choices[0].message.content;
  
      res.json({
        ingredients,
        products: productResults,
        filtered: filteredProducts,
        plan,
      });
    } catch (err) {
      console.error("Error in /api/mealplan/from-tj:", err);
      res.status(500).json({ error: "Full meal planning flow failed" });
    }
  });
  
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
