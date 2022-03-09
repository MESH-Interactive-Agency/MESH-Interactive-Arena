using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using EzySlice;

public class saber : MonoBehaviour
{

    public GameObject controller;

    public Slicer slicer;
    
    public LayerMask layer;
    private Vector3 previousPos;

    // Start is called before the first frame update
    void Start()
    {
        
    }

    // Update is called once per frame


    void Update()
    {
        RaycastHit hit;

            if (Physics.Raycast(transform.position, transform.forward, out hit, 1.5f, layer))
            {

                if (Vector3.Angle(transform.position - previousPos, hit.transform.up) > 45)
                {
                    slicer.isTouched = true;
                    FindObjectOfType<Scoreboard>().IncreaseHits();

                }
            }
        previousPos = transform.position;
    }



    // private void OnCollisionStay(Collision collisionInfo)
    // {
    //
    //         slicer.isTouched = true;
    //     previousPos = transform.position;
    // }

}
