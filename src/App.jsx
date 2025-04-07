import { useState } from "react";
import axios from "axios";

function App() {
  const [preferences, setPreferences] = useState("");
  const [ingredients, setIngredients] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [mealPlan, setMealPlan] = useState("");
  const [loading, setLoading] = useState(false);

  const calculateTotalCost = () => {
    return filteredProducts.reduce((total, item) => {
      const price = parseFloat(item.retail_price);
      const qty = item.quantity || 1;
      return isNaN(price) ? total : total + price * qty;
    }, 0);
  };

  const getShoppingList = () => {
    return filteredProducts.map((item) => {
      const price = parseFloat(item.retail_price);
      const quantity = item.quantity || 1;
      return {
        name: item.name,
        quantity,
        unitPrice: price,
        total: isNaN(price) ? 0 : price * quantity,
        uom: item.sales_uom_description || "",
      };
    });
  };

  const renderShoppingList = () => {
    const shoppingList = getShoppingList();
    const grandTotal = shoppingList.reduce((sum, item) => sum + item.total, 0);

    if (shoppingList.length === 0) return null;

    return (
      <div className="mt-5">
        <h2 className="h5 text-center mb-3">🧺 Shopping List</h2>
        <div className="table-responsive">
          <table className="table table-bordered table-sm align-middle">
            <thead className="table-light">
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {shoppingList.map((item, i) => (
                <tr key={i}>
                  <td>{item.name}</td>
                  <td>{item.quantity}</td>
                  <td>{item.uom}</td>
                  <td>${item.unitPrice.toFixed(2)}</td>
                  <td>${item.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="table-success fw-bold">
                <td colSpan={4} className="text-end">Total</td>
                <td>${grandTotal.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  const generateFullPlan = async () => {
    if (!preferences) return;
    setLoading(true);
    setIngredients([]);
    setAllProducts([]);
    setFilteredProducts([]);
    setMealPlan("");

    try {
      const res = await axios.get("http://localhost:3001/api/mealplan/from-tj", {
        params: { preferences },
      });

      const { ingredients, products, plan } = res.data;

      setIngredients(ingredients);
      setAllProducts(products);
      setMealPlan(plan);

      const filterRes = await axios.post("http://localhost:3001/api/mealplan/filter-products", {
        preferences,
        products,
      });

      setFilteredProducts(filterRes.data.filtered);
    } catch (err) {
      console.error("Error during meal plan generation:", err);
      alert("Something went wrong. Check the server logs.");
    } finally {
      setLoading(false);
    }
  };

  const renderMealPlan = () => {
    if (!mealPlan) return null;

    const days = mealPlan.split(/Day \d+:/).slice(1);
    return (
      <div className="mt-5">
        <h2 className="h4 fw-bold text-primary mb-3 text-center">📅 Weekly Meal Plan</h2>
        <div className="row g-4 justify-content-center">
          {days.map((dayBlock, i) => (
            <div key={i} className="col-md-5 col-lg-4">
              <div className="card border-0 shadow-sm h-100 bg-light-subtle">
                <div className="card-body">
                  <h5 className="card-title text-primary-emphasis">Day {i + 1}</h5>
                  {dayBlock
                    .trim()
                    .split("\n")
                    .map((line, j) => (
                      <p key={j} className="card-text mb-1 text-dark">
                        {line.trim()}
                      </p>
                    ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSearchTags = () =>
    ingredients.length > 0 && (
      <div className="mt-5 text-center">
        <h2 className="h5 mb-3 text-secondary">🔍 GPT Search Terms</h2>
        <div className="d-flex flex-wrap justify-content-center gap-2">
          {ingredients.map((item, i) => (
            <span key={i} className="badge bg-info-subtle text-info-emphasis px-3 py-2">
              {item}
            </span>
          ))}
        </div>
      </div>
    );

  const renderProductList = (title, products) => (
    <div className="mt-5">
      <h2 className="h5 mb-3 text-center">{title}</h2>
      {products.length === 0 ? (
        <p className="text-center text-muted fst-italic">No matching products found.</p>
      ) : (
        <div className="row g-4 justify-content-center">
          <div className="mt-4 text-center">
            <h5 className="fw-bold text-success">
              🧾 Estimated Total Cost: ${calculateTotalCost().toFixed(2)}
            </h5>
            <p className="text-muted small">
              Based on Trader Joe’s filtered product prices × quantities
            </p>
          </div>
          {products.map((item, i) => (
            <div key={i} className="col-sm-6 col-md-4 col-lg-3">
              <div className="card h-100 shadow-sm border-0">
                <div className="card-body">
                  <h6 className="card-title fw-bold">{item.name}</h6>
                  {item.sales_size && (
                    <p className="text-muted small mb-1">Size: {item.sales_size}</p>
                  )}
                  {item.retail_price && !isNaN(item.retail_price) && (
                    <p className="text-success fw-semibold mb-1">
                      ${parseFloat(item.retail_price).toFixed(2)} × {item.quantity || 1}
                    </p>
                  )}
                  {item.item_description && (
                    <p className="small text-muted">{item.item_description}</p>
                  )}
                </div>
                <div className="card-footer bg-transparent text-end border-0">
                  <span className="badge bg-secondary-subtle text-secondary-emphasis small">
                    matched: {item.matchedTerm}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="container py-5 d-flex justify-content-center">
      <div className="w-100" style={{ maxWidth: "1200px" }}>
      <div className="text-center mb-5">
        <h1 className="fw-bold text-primary mb-2">🧠 GPT + Trader Joe’s Meal Planner</h1>
        <p className="text-muted">Personalized weekly meals using real grocery items</p>
      </div>

      <div className="row justify-content-center mb-4">
        <div className="col-md-8 col-lg-6">
          <div className="input-group">
            <input
              type="text"
              className="form-control"
              placeholder="e.g. gluten-free, high protein, vegetarian"
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
            />
            <button
              onClick={generateFullPlan}
              className="btn btn-success"
              disabled={loading}
            >
              {loading ? "Loading..." : "Generate"}
            </button>
          </div>
        </div>
      </div>

      {renderShoppingList()}
      {renderMealPlan()}
      {renderSearchTags()}
      {renderProductList("✅ Products GPT Recommends", filteredProducts)}
      {renderProductList("🛒 All Trader Joe’s Products Found", allProducts)}
    </div>
    </div>
  );
}

export default App;
