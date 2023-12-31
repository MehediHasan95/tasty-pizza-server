const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 8080;
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const SSLCommerzPayment = require("sslcommerz-lts");
const admin = require("firebase-admin");
var serviceAccount = require("./serviceAccountKey.json");

// middleware
app.use(cors());
app.use(express.json());

const client = new MongoClient(
  `mongodb+srv://${process.env.BUCKET}:${process.env.SECRET_KEY}@cluster0.mnvzcly.mongodb.net/?retryWrites=true&w=majority`,
  {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  }
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const unauthorizedAccess = { status: 401, message: "Unauthorized access" };
const forbiddenAccess = { status: 403, message: "Forbidden access" };

const verifyJWT = (req, res, next) => {
  const token = req.headers.authorization;
  if (token) {
    jwt.verify(token, process.env.ACCESS_KEY, (err, decoded) => {
      if (err) {
        res.status(401).send(unauthorizedAccess);
      } else {
        req.decoded = decoded;
        next();
      }
    });
  } else {
    res.status(401).send(unauthorizedAccess);
  }
};

const trxnIdGenerator = () => {
  const trxn = "TP_" + Math.round(Math.random() * 10000000000);
  if (trxn.length !== 13) {
    return trxnIdGenerator();
  }
  return trxn;
};

async function run() {
  try {
    app.get("/", (req, res) => res.send("TASTY PIZZA SERVER RUNNING"));
    await client.connect();
    // db collection name
    const userCollection = client.db("pastyPizzaDB").collection("users");
    const itemCollection = client.db("pastyPizzaDB").collection("items");
    const cartCollection = client.db("pastyPizzaDB").collection("carts");
    const orderCollection = client.db("pastyPizzaDB").collection("orders");

    app.post("/jwt", (req, res) => {
      const data = req.body;
      const token = jwt.sign(data, process.env.ACCESS_KEY, {
        expiresIn: "30days",
      });
      res.send({ token });
    });

    app.get("/role/:uid", async (req, res) => {
      const uid = req.params.uid;
      const data = await userCollection.findOne({ uid: { $eq: uid } });
      if (data) {
        res.send({ role: data.role });
      }
    });

    app.get("/users", verifyJWT, async (req, res) => {
      if (req.decoded.uid === req.query.uid) {
        const results = await userCollection.find().toArray();
        res.send(results);
      } else {
        res.status(403).send(forbiddenAccess);
      }
    });

    app.post("/users", async (req, res) => {
      const data = req.body;
      const matched = await userCollection.findOne({ uid: { $eq: data.uid } });
      if (!matched) {
        const result = await userCollection.insertOne(data);
        res.send(result);
      } else {
        res.send({ matched: true });
      }
    });

    app.delete("/delete-user", verifyJWT, async (req, res) => {
      if (req.decoded.uid === req.query.uid) {
        admin
          .auth()
          .deleteUser(req.query.fid)
          .then(async () => {
            const result = await userCollection.deleteOne({
              _id: new ObjectId(req.query.mid),
            });
            res.send(result);
          });
      } else {
        res.status(403).send(forbiddenAccess);
      }
    });

    app.get("/profile", verifyJWT, async (req, res) => {
      if (req.decoded.uid === req.query.uid) {
        const result = await userCollection.findOne({
          uid: { $eq: req.query.uid },
        });
        res.send(result);
      } else {
        res.status(403).send(forbiddenAccess);
      }
    });

    app.patch("/update-profile/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: data,
      };
      if (req.decoded.uid === req.query.uid) {
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } else {
        res.status(403).send(forbiddenAccess);
      }
    });

    app.get("/all-items", async (req, res) => {
      const filter =
        req.query.category === "all"
          ? {}
          : { category: { $eq: req.query.category } };
      const limit = parseInt(req.query.limit);
      const results = await itemCollection.find(filter).limit(limit).toArray();
      res.send(results);
    });

    app.get("/item-detail/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await itemCollection.findOne(query);
      res.send(result);
    });

    app.get("/admin-all-items", verifyJWT, async (req, res) => {
      if (req.decoded.uid === req.query.uid) {
        const results = await itemCollection.find().toArray();
        res.send(results);
      } else {
        res.status(403).send(forbiddenAccess);
      }
    });

    app.get("/admin-item-update/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      if (req.decoded.uid === req.query.uid) {
        const result = await itemCollection.findOne(query);
        res.send(result);
      } else {
        res.status(403).send(forbiddenAccess);
      }
    });

    app.patch("/admin-item-update/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      if (req.decoded.uid === req.query.uid) {
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: data,
        };
        const result = await itemCollection.updateOne(filter, updateDoc);
        res.send(result);
      } else {
        res.status(403).send(forbiddenAccess);
      }
    });

    app.post("/add-item", async (req, res) => {
      const data = req.body;
      const result = await itemCollection.insertOne(data);
      res.send(result);
    });

    app.delete("/item-delete/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      if (req.decoded.uid === req.query.uid) {
        const query = { _id: new ObjectId(id) };
        const result = await itemCollection.deleteOne(query);
        res.send(result);
      } else {
        res.status(403).send(forbiddenAccess);
      }
    });

    app.delete("/remove-cart-item/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    //----
    app.get("/add-to-cart", verifyJWT, async (req, res) => {
      if (req.decoded.uid === req.query.uid) {
        const results = await cartCollection
          .find({ uid: { $eq: req.query.uid } })
          .toArray();
        res.send(results);
      } else {
        req.status(403).send(forbiddenAccess);
      }
    });

    app.post("/add-to-cart", async (req, res) => {
      const data = req.body;
      const isExist = await cartCollection.findOne({
        itemId: { $eq: data.itemId },
      });

      if (!isExist) {
        const result = await cartCollection.insertOne(data);
        res.send(result);
      } else {
        res.send({ exist: true });
      }
    });

    app.get("/admin-order", verifyJWT, async (req, res) => {
      if (req.decoded.uid === req.query.uid) {
        const results = await orderCollection.find().toArray();
        res.send(results);
      } else {
        res.status(403).send(forbiddenAccess);
      }
    });

    app.delete("/admin-order-delete/:id", verifyJWT, async (req, res) => {
      const result = await orderCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    app.patch("/admin-order-delete/:id", verifyJWT, async (req, res) => {
      const result = await orderCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        {
          $set: {
            status: true,
          },
        }
      );
      res.send(result);
    });

    app.get("/my-orders", verifyJWT, async (req, res) => {
      if (req.decoded.uid === req.query.uid) {
        const results = await orderCollection
          .find({ uid: { $eq: req.query.uid } })
          .toArray();
        res.send(results);
      } else {
        res.status(403).send(forbiddenAccess);
      }
    });

    app.delete("/order-delete/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = orderCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const info = req.body;
      const trxn_id = trxnIdGenerator();
      if (req.decoded.uid === req.query.uid) {
        const data = {
          total_amount: info.total_price,
          currency: "BDT",
          tran_id: trxn_id,
          success_url: `https://tasty-pizza-server.vercel.app/payment-success/${trxn_id}?uid=${info.uid}`,
          fail_url: "https://tasty-pizza-server.vercel.app/cancle-payment",
          cancel_url: "https://tasty-pizza-server.vercel.app/cancle-payment",
          ipn_url: "http://localhost:5173/ipn",
          shipping_method: "Courier",
          product_name: "Computer.",
          product_category: "Electronic",
          product_profile: "general",
          cus_name: info.fullName,
          cus_email: info.email,
          cus_add1: info.address,
          cus_city: info.city,
          cus_postcode: info.postcode,
          cus_country: "Bangladesh",
          cus_phone: info.phone,
          ship_name: info.fullName,
          ship_add1: info.address,
          ship_city: info.city,
          ship_postcode: info.postcode,
          ship_country: "Bangladesh",
        };

        const sslcz = new SSLCommerzPayment(
          process.env.STORE_ID,
          process.env.STORE_PASS,
          false
        );
        sslcz.init(data).then((apiResponse) => {
          let GatewayPageURL = apiResponse.GatewayPageURL;
          res.send({ url: GatewayPageURL });
        });
        await orderCollection.insertOne({
          ...info,
          transaction_id: data.tran_id,
          payment_status: false,
          status: false,
        });
      } else {
        res.status(403).send(forbiddenAccess);
      }
    });

    app.post("/payment-success/:tran_id", async (req, res) => {
      const tran_id = req.params.tran_id;
      const cartList = await cartCollection
        .find({ uid: { $eq: req.query.uid } })
        .toArray();
      const confirmPayment = await orderCollection.findOne({
        transaction_id: { $eq: req.params.tran_id },
      });
      await orderCollection.updateOne(
        { _id: new ObjectId(confirmPayment._id) },
        {
          $set: { payment_status: true },
        }
      );
      for (const element of confirmPayment.carts) {
        await itemCollection.updateOne(
          { _id: new ObjectId(element.itemId) },
          { $inc: { quantity: -1 } }
        );
      }
      await cartCollection.deleteMany({
        _id: { $in: cartList.map((e) => new ObjectId(e._id)) },
      });
      res.redirect(
        `https://tasty-pizza-restaurant.web.app/payment-success/${tran_id}`
      );
    });

    app.post("/cancle-payment", (req, res) => {
      res.redirect(
        "https://tasty-pizza-restaurant.web.app/user-dashboard/my-cart"
      );
    });

    //--
  } finally {
    app.listen(port, () =>
      console.log("Pasty Pizza server is running port: ", port)
    );
  }
}
run().catch(console.dir);
