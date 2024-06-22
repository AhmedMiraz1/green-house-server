const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe =require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;

//middleware
const corsOptions = {
  origin: [
    "b9-12-46aab.web.app",
    "http://localhost:5173",
    "http://localhost:5175",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6w72r5l.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const apartmentCollection = client.db("greenHouse").collection("apartment");
    const agreementCollection = client.db("greenHouse").collection("agreement");
    const userCollection = client.db("greenHouse").collection("users");
    const announcementCollection = client
      .db("greenHouse")
      .collection("announcement");

    const couponsCollection = client.db("greenHouse").collection("coupons");
    const paymentCollection = client.db("bistroDb").collection("payments");

    // jwt

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      res.send({ token });
    });

    //middleware

    const verifyToken = (req, res, next) => {
      // console.log("inside verify token ", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };
    // use verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //user related api

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: " forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      return res.send({ admin });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist ", insertId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        console.log(result);
        res.send(result);
      }
    );

    // member

    app.get("/users/member/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: " forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let member = false;
      if (user) {
        member = user?.role === "member";
      }
      return res.send({ member });
    });

    app.patch(
      "/users/member/:id",

      async (req, res) => {
        console.log("req", req.params);
        const email = req.body.email;
        const id = req.params.id;
        console.log("id", id, email);
        const isExists = await userCollection.findOne({ email });
        console.log("user", isExists);
        const updatedDoc = {
          $set: {
            role: "member",
          },
        };
        const result = await userCollection.updateOne({ email }, updatedDoc);
        if (result.modifiedCount) {
          await agreementCollection.updateOne(
            { email },
            { $set: { status: "approved" } }
          );
          res.send(result);
        }
      }
    );

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // apartment api

    app.get("/apartments", async (req, res) => {
      const result = await apartmentCollection.find().toArray();
      res.send(result);
    });

    // agreement collection api
    app.get("/agreement", async (req, res) => {
      const result = await agreementCollection.find().toArray();
      res.send(result);
    });

    app.get("/agreement/:email", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartsCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/agreement", async (req, res) => {
      const cartItem = req.body;
      const result = await agreementCollection.insertOne(cartItem);
      res.send(result);
    });

    

    app.delete("/agreement/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await agreementCollection.deleteOne(query);
      res.send(result);
    });

    // pagination

    app.get("/all-apartments", async (req, res) => {
      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      console.log(size, page);
      const result = await apartmentCollection
        .find()
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });

    app.get("/apartments-count", async (req, res) => {
      const count = await apartmentCollection.countDocuments();
      res.send({ count });
    });

    // announcement api

    app.post("/announcement", async (req, res) => {
      const announcement = req.body;
      const result = await announcementCollection.insertOne(announcement);
      res.send(result);
    });

    app.get("/announcements", async (req, res) => {
      const result = await announcementCollection.find().toArray();
      res.send(result);
    });

    //coupons api

    app.post("/coupons", async (req, res) => {
      const coupons = req.body;
      const result = await couponsCollection.insertOne(coupons);
      res.send(result);
    });

    app.get("/coupons", async (req, res) => {
      const result = await couponsCollection.find().toArray();
      res.send(result);
    });

      //payment intent

      app.post("/create-payment-intent", async (req, res) => {
        const { price } = req.body;
        const amount = parseInt(price * 100);
        console.log(amount);
  
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      });


      app.get("/payments/:email", verifyToken, async (req, res) => {
        const query = { email: req.params.email };
        if (req.params.email !== req.decoded.email) {
          return res.status(403).send({ message: "forbidden access" });
        }
        const result = await paymentCollection.find(query).toArray();
        res.send(result);
      });

      app.post("/payments", async (req, res) => {
        const payment = req.body;
  
        console.log(payment);
        const paymentResult = await paymentCollection.insertOne(payment);
  
        //  carefully delete each item from the cart
        console.log("payment info", payment);
        const query = {
          _id: {
            $in: payment.cartIds.map((id) => new ObjectId(id)),
          },
        };
  
        const deleteResult = await agreementCollection.deleteMany(query);
  
        res.send({ paymentResult, deleteResult });
      });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("green house making server is running");
});

app.listen(port, () => {
  console.log(`server is running on port : ${port}`);
});
