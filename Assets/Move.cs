using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class Move : MonoBehaviour
{
    public float speed = 2;
    private bool beenHit = false;


    // Start is called before the first frame update
    void Start()
    {

}

    // Update is called once per frame
    void Update()
    {
        transform.position -= Time.deltaTime * transform.forward * speed;

        if (transform.position.z < -2.0f)
        {
            FindObjectOfType<Scoreboard>().IncreaseMisses();
            Destroy(gameObject);
        }
        
    }
}
